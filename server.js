const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 静态文件服务
app.use(express.static(__dirname));
app.use('/imgs', express.static(path.join(__dirname, 'imgs')));

// 游戏房间管理
const rooms = new Map();

// 游戏状态
class GameRoom {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];
    this.gameState = {
      started: false,
      currentPlayer: 0,
      currentRound: 0,
      totalRounds: 0,
      deck: [],
      hands: [[], [], [], []],
      currentDong: [],
      dongFirstPlayer: -1, // 当前栋的首家
      lastWinner: 0,
      gameOver: false,
      winner: null,
      dongScores: [0, 0, 0, 0], // 每个玩家赢得的栋数
      scores: [0, 0, 0, 0], // 每个玩家的积分
      dealerPosition: -1, // 庄家位置
      isFirstHand: true, // 是否是第一局
      waitingForDice: false, // 是否等待摇骰
      outPlayers: [false, false, false, false] // 标记哪些玩家被OUT（最后一张牌无栋数）
    };
  }

  addPlayer(ws, playerId, playerName, isBot = false) {
    if (this.players.length >= 4) {
      return false;
    }
    this.players.push({ ws, playerId, playerName, ready: false, isBot });
    return true;
  }

  addBots() {
    const botNames = ['机器人A', '机器人B', '机器人C'];
    let addedCount = 0;
    
    for (let i = 0; i < 3 && this.players.length < 4; i++) {
      const botId = 'bot_' + Date.now() + '_' + i;
      this.addPlayer(null, botId, botNames[i], true);
      addedCount++;
    }
    
    return addedCount;
  }

  removePlayer(playerId) {
    const index = this.players.findIndex(p => p.playerId === playerId);
    if (index !== -1) {
      const removedPlayer = this.players[index];
      this.players.splice(index, 1);
      
      // 如果移除的是真人玩家，检查是否还有其他真人玩家
      if (!removedPlayer.isBot) {
        const hasHumanPlayers = this.players.some(p => !p.isBot);
        if (!hasHumanPlayers) {
          // 没有真人玩家了，清空房间
          this.players = [];
          return true;
        }
      }
      
      if (this.players.length === 0) {
        return true; // 房间为空，可以删除
      }
    }
    return false;
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    this.players.forEach(player => {
      if (player.ws && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(data);
      }
    });
  }

  sendToPlayer(playerId, message) {
    const player = this.players.find(p => p.playerId === playerId);
    if (player && player.ws && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify(message));
    }
  }

  // 获取逆时针下一个玩家位置
  // 逆时针顺序：0→2→3→1→0（左上→左下→右下→右上）
  getNextPlayerCounterClockwise(currentPosition) {
    const counterClockwiseOrder = [0, 2, 3, 1];
    const currentIndex = counterClockwiseOrder.indexOf(currentPosition);
    const nextIndex = (currentIndex + 1) % 4;
    return counterClockwiseOrder[nextIndex];
  }

  startGame() {
    if (this.players.length !== 4) return;
    
    this.gameState.started = true;
    this.gameState.currentRound = 0;
    this.gameState.gameOver = false;
    this.gameState.winner = null;
    this.gameState.outPlayers = [false, false, false, false]; // 重置OUT状态
    
    // 广播游戏开始
    this.broadcast({
      type: 'gameStart',
      gameState: this.getPublicGameState()
    });

    // 第一局：等待任意玩家摇骰
    if (this.gameState.isFirstHand) {
      console.log(`第一局，等待玩家摇骰子`);
      
      // 等待摇骰
      this.waitForDiceRoll();
    } else {
      // 后续局：赢家是庄家，直接发牌
      this.initializeDeck();
      this.dealCards();
      
      // 发送各玩家的手牌
      this.players.forEach((player, index) => {
        this.sendToPlayer(player.playerId, {
          type: 'dealCards',
          cards: this.gameState.hands[index],
          position: index
        });
      });

      // 庄家先出牌
      this.gameState.currentPlayer = this.gameState.dealerPosition;
      this.broadcast({
        type: 'turnChange',
        currentPlayer: this.gameState.currentPlayer
      });

      // 如果庄家是机器人，触发自动出牌
      this.botAutoPlay();
    }
  }

  waitForDiceRoll() {
    this.gameState.waitingForDice = true;
    
    // 广播等待摇骰消息
    this.broadcast({
      type: 'waitForDice',
      dealerPosition: this.gameState.dealerPosition,
      firstHandDealer: -1 // 第一局还不知道真正的庄家
    });
    
    // 如果摇骰者是机器人，自动摇骰
    const diceRollerPosition = (this.gameState.dealerPosition + 2) % 4;
    const diceRoller = this.players[diceRollerPosition];
    
    if (diceRoller && diceRoller.isBot) {
      setTimeout(() => {
        this.handleDiceRoll(diceRoller.playerId);
      }, 2000); // 机器人延迟2秒摇骰
    }
  }

  handleDiceRoll(playerId) {
    if (!this.gameState.waitingForDice) return;
    
    // 第一局可以是任何人摇骰，后续局必须是庄家对面的人
    let diceRollerPosition;
    if (this.gameState.isFirstHand) {
      // 第一局：任何准备好的玩家都可以摇
      diceRollerPosition = this.players.findIndex(p => p.playerId === playerId);
      if (diceRollerPosition === -1) return;
    } else {
      // 后续局：必须是庄家对面的人摇骰
      diceRollerPosition = (this.gameState.dealerPosition + 2) % 4;
      const playerIndex = this.players.findIndex(p => p.playerId === playerId);
      
      if (playerIndex !== diceRollerPosition) {
        console.log(`玩家 ${playerIndex} 不是摇骰者 ${diceRollerPosition}`);
        return;
      }
    }
    
    // 摇两个骰子
    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = Math.floor(Math.random() * 6) + 1;
    const total = dice1 + dice2;
    
    console.log(`摇骰结果: ${dice1} + ${dice2} = ${total}`);
    
    // 从摇骰子的人开始逆时针数（包括摇骰子的人自己）
    // 座位布局：0(左上) 1(右上) 2(左下) 3(右下)
    // 逆时针顺序：0→2→3→1→0（左上→左下→右下→右上）
    const counterClockwiseOrder = [0, 2, 3, 1];
    
    // 找到摇骰子的人在逆时针序列中的索引
    const rollerIndex = counterClockwiseOrder.indexOf(diceRollerPosition);
    // 从摇骰子的人开始数total个位置（包括起点，所以是 +total-1）
    const firstPlayerIndex = (rollerIndex + total - 1) % 4;
    const firstPlayer = counterClockwiseOrder[firstPlayerIndex];
    
    // 先出牌的人的逆时针下一家是庄家
    const dealerIndex = (firstPlayerIndex + 1) % 4;
    const actualDealer = counterClockwiseOrder[dealerIndex];
    
    this.gameState.dealerPosition = actualDealer;
    this.gameState.isFirstHand = false;
    this.gameState.waitingForDice = false;
    
    console.log(`摇骰结果: ${dice1} + ${dice2} = ${total}, 摇骰者: 座位${diceRollerPosition}, 从座位${diceRollerPosition}开始逆时针数${total}个, 先出牌: 座位${firstPlayer}, 庄家: 座位${actualDealer}`);
    
    // 广播骰子结果
    this.broadcast({
      type: 'diceRolled',
      dice1,
      dice2,
      firstPlayer,
      dealerPosition: actualDealer
    });
    
    // 延迟发牌，让客户端先播放动画（3秒动画 + 3秒显示结果）
    setTimeout(() => {
      this.initializeDeck();
      this.dealCards();
      
      // 发送各玩家的手牌
      this.players.forEach((player, index) => {
        this.sendToPlayer(player.playerId, {
          type: 'dealCards',
          cards: this.gameState.hands[index],
          position: index
        });
      });

      // 先出牌的人开始
      this.gameState.currentPlayer = firstPlayer;
      this.broadcast({
        type: 'turnChange',
        currentPlayer: this.gameState.currentPlayer
      });

      // 如果第一个玩家是机器人，触发自动出牌
      this.botAutoPlay();
    }, 6500); // 6.5秒后发牌（3秒动画 + 3秒显示结果 + 0.5秒缓冲）
  }

  initializeDeck() {
    // 天九牌定义（32张）
    // ID命名规则：
    // 文牌(Wen): W + 牌名首字母 + 序号(1或2)
    // 武牌(Wu): M + 点数组合（如M36表示3+6=9点）
    
    // Power值定义：
    // 文牌：天(100), 地(90), 人(80), 和(70), 梅(60), 长三(50), 板凳(45), 斧头(40), 红头十(35), 高脚七(30), 伶冧六(25)
    // 武牌：九点(9), 八点(8), 七点(7), 六点(6), 五点(5), 三点(3)
    
    this.gameState.deck = [
      // ===== 文牌（22张，11种，每种2张）=====
      // 天牌 (12点 = 6+6)
      { id: 'WT1', name: '天', type: 'wen', points: 12, power: 100, dots: '6+6', image: '天.svg' },
      { id: 'WT2', name: '天', type: 'wen', points: 12, power: 100, dots: '6+6', image: '天.svg' },
      
      // 地牌 (2点 = 1+1)
      { id: 'WD1', name: '地', type: 'wen', points: 2, power: 90, dots: '1+1', image: '地.svg' },
      { id: 'WD2', name: '地', type: 'wen', points: 2, power: 90, dots: '1+1', image: '地.svg' },
      
      // 人牌 (8点 = 4+4)
      { id: 'WR1', name: '人', type: 'wen', points: 8, power: 80, dots: '4+4', image: '人.svg' },
      { id: 'WR2', name: '人', type: 'wen', points: 8, power: 80, dots: '4+4', image: '人.svg' },
      
      // 和牌/鹅牌 (4点 = 1+3)
      { id: 'WH1', name: '和', type: 'wen', points: 4, power: 70, dots: '1+3', image: '饿.svg' },
      { id: 'WH2', name: '和', type: 'wen', points: 4, power: 70, dots: '1+3', image: '饿.svg' },
      
      // 梅花 (10点 = 5+5)
      { id: 'WM1', name: '梅', type: 'wen', points: 10, power: 60, dots: '5+5', image: '梅.svg' },
      { id: 'WM2', name: '梅', type: 'wen', points: 10, power: 60, dots: '5+5', image: '梅.svg' },
      
      // 长三/长衫 (6点 = 3+3)
      { id: 'WC1', name: '长三', type: 'wen', points: 6, power: 50, dots: '3+3', image: '长山.svg' },
      { id: 'WC2', name: '长三', type: 'wen', points: 6, power: 50, dots: '3+3', image: '长山.svg' },
      
      // 板凳 (4点 = 2+2)
      { id: 'WB1', name: '板凳', type: 'wen', points: 4, power: 45, dots: '2+2', image: '板凳.svg' },
      { id: 'WB2', name: '板凳', type: 'wen', points: 4, power: 45, dots: '2+2', image: '板凳.svg' },
      
      // 斧头/虎头 (11点 = 5+6)
      { id: 'WF1', name: '斧头', type: 'wen', points: 11, power: 40, dots: '5+6', image: '斧头.svg' },
      { id: 'WF2', name: '斧头', type: 'wen', points: 11, power: 40, dots: '5+6', image: '斧头.svg' },
      
      // 红头十/平峰/屏风 (10点 = 4+6)
      { id: 'WP1', name: '红头十', type: 'wen', points: 10, power: 35, dots: '4+6', image: '平峰.svg' },
      { id: 'WP2', name: '红头十', type: 'wen', points: 10, power: 35, dots: '4+6', image: '平峰.svg' },
      
      // 高脚七 (7点 = 1+6)
      { id: 'WG1', name: '高脚七', type: 'wen', points: 7, power: 30, dots: '1+6', image: '高脚七.svg' },
      { id: 'WG2', name: '高脚七', type: 'wen', points: 7, power: 30, dots: '1+6', image: '高脚七.svg' },
      
      // 伶冧六/零冧六/铜锤六 (6点 = 1+5)
      { id: 'WL1', name: '伶冧六', type: 'wen', points: 6, power: 25, dots: '1+5', image: '鼻屎六.svg' },
      { id: 'WL2', name: '伶冧六', type: 'wen', points: 6, power: 25, dots: '1+5', image: '鼻屎六.svg' },
      
      // ===== 武牌（10张，各不相同）=====
      // 注：单个武牌叫"X点"，成对才叫"杂X"
      
      // 九点 (两种组合)
      { id: 'M36', name: '九点', type: 'wu', points: 9, power: 9, dots: '3+6', image: '九点A.svg' },
      { id: 'M45', name: '九点', type: 'wu', points: 9, power: 9, dots: '4+5', image: '九点B.svg' },
      
      // 八点 (两种组合)
      { id: 'M26', name: '八点', type: 'wu', points: 8, power: 8, dots: '2+6', image: '八点A.svg' },
      { id: 'M35', name: '八点', type: 'wu', points: 8, power: 8, dots: '3+5', image: '八点B.svg' },
      
      // 七点 (两种组合)
      { id: 'M25', name: '七点', type: 'wu', points: 7, power: 7, dots: '2+5', image: '七点A.svg' },
      { id: 'M34', name: '七点', type: 'wu', points: 7, power: 7, dots: '3+4', image: '七点B.svg' },
      
      // 五点 (两种组合)
      { id: 'M14', name: '五点', type: 'wu', points: 5, power: 5, dots: '1+4', image: '五点A.svg' },
      { id: 'M23', name: '五点', type: 'wu', points: 5, power: 5, dots: '2+3', image: '五点B.svg' },
      
      // 六点 (大头六/二四)
      { id: 'M24', name: '六点', type: 'wu', points: 6, power: 6, dots: '2+4', image: '六点.svg' },
      
      // 三点 (三鸡/细么/丁三)
      { id: 'M12', name: '三点', type: 'wu', points: 3, power: 3, dots: '1+2', image: '三点.svg' }
    ];

    // 洗牌
    this.shuffle(this.gameState.deck);
    
    // 初始化牌型组合映射表
    this.initializeCombinationMap();
  }

  // 初始化所有有效牌型组合的映射表
  initializeCombinationMap() {
    this.combinationMap = {
      single: new Map(),  // 单张牌
      pair: new Map(),    // 对子（2张）
      triple: new Map(),  // 三张
      quad: new Map()     // 四张
    };

    // === 1. 单张牌映射 ===
    // 直接使用每张牌的power值
    this.gameState.deck.forEach(card => {
      this.combinationMap.single.set(card.id, {
        type: 'single',
        cardType: card.type,
        power: card.power,  // 直接使用定义的power
        name: card.name
      });
    });

    // === 2. 两张牌组合映射 ===
    
    // 2.1 文对（11种）- power = 两张牌的power之和
    const wenPairs = [
      { ids: ['WT1', 'WT2'], name: '双天' },  // 100+100=200
      { ids: ['WD1', 'WD2'], name: '双地' },  // 90+90=180
      { ids: ['WR1', 'WR2'], name: '双人' },  // 80+80=160
      { ids: ['WH1', 'WH2'], name: '双和' },  // 70+70=140
      { ids: ['WM1', 'WM2'], name: '双梅' },  // 60+60=120
      { ids: ['WC1', 'WC2'], name: '双长三' }, // 50+50=100
      { ids: ['WB1', 'WB2'], name: '双板凳' }, // 45+45=90
      { ids: ['WF1', 'WF2'], name: '双斧头' }, // 40+40=80
      { ids: ['WP1', 'WP2'], name: '双红头十' }, // 35+35=70
      { ids: ['WG1', 'WG2'], name: '双高脚七' }, // 30+30=60
      { ids: ['WL1', 'WL2'], name: '双伶冧六' }  // 25+25=50
    ];
    wenPairs.forEach(pair => {
      const card1 = this.gameState.deck.find(c => c.id === pair.ids[0]);
      const card2 = this.gameState.deck.find(c => c.id === pair.ids[1]);
      const power = card1.power + card2.power;
      
      const key = this.makePairKey(pair.ids);
      this.combinationMap.pair.set(key, {
        type: 'wen_pair',
        name: pair.name,
        power: power,
        ids: pair.ids
      });
    });

    // 2.2 武对（5种）- power = 两张牌的power之和
    const wuPairs = [
      { ids: ['M36', 'M45'], name: '杂九' },  // 9+9=18
      { ids: ['M26', 'M35'], name: '杂八' },  // 8+8=16
      { ids: ['M25', 'M34'], name: '杂七' },  // 7+7=14
      { ids: ['M14', 'M23'], name: '杂五' }   // 5+5=10
      // 注：六点和三点各只有1张，无法成对
    ];
    wuPairs.forEach(pair => {
      const card1 = this.gameState.deck.find(c => c.id === pair.ids[0]);
      const card2 = this.gameState.deck.find(c => c.id === pair.ids[1]);
      const power = card1.power + card2.power;
      
      const key = this.makePairKey(pair.ids);
      this.combinationMap.pair.set(key, {
        type: 'wu_pair',
        name: pair.name,
        power: power,
        ids: pair.ids
      });
    });

    // 2.3 文武对（天九、地八、人七、和五）- power = 两张牌的power之和
    const wenwuPairs = [
      // 天九：天(100) + 九点(9) = 109
      { ids: ['WT1', 'M36'], name: '天九' },
      { ids: ['WT1', 'M45'], name: '天九' },
      { ids: ['WT2', 'M36'], name: '天九' },
      { ids: ['WT2', 'M45'], name: '天九' },
      
      // 地八：地(90) + 八点(8) = 98
      { ids: ['WD1', 'M26'], name: '地八' },
      { ids: ['WD1', 'M35'], name: '地八' },
      { ids: ['WD2', 'M26'], name: '地八' },
      { ids: ['WD2', 'M35'], name: '地八' },
      
      // 人七：人(80) + 七点(7) = 87
      { ids: ['WR1', 'M25'], name: '人七' },
      { ids: ['WR1', 'M34'], name: '人七' },
      { ids: ['WR2', 'M25'], name: '人七' },
      { ids: ['WR2', 'M34'], name: '人七' },
      
      // 和五：和(70) + 五点(5) = 75
      { ids: ['WH1', 'M14'], name: '和五' },
      { ids: ['WH1', 'M23'], name: '和五' },
      { ids: ['WH2', 'M14'], name: '和五' },
      { ids: ['WH2', 'M23'], name: '和五' }
    ];
    wenwuPairs.forEach(pair => {
      const card1 = this.gameState.deck.find(c => c.id === pair.ids[0]);
      const card2 = this.gameState.deck.find(c => c.id === pair.ids[1]);
      const power = card1.power + card2.power;
      
      const key = this.makePairKey(pair.ids);
      this.combinationMap.pair.set(key, {
        type: 'wenwu_pair',
        name: pair.name,
        power: power,
        ids: pair.ids
      });
    });

    // 2.4 特殊组合 - 至尊
    // 至尊（武尊）- 三点(3) + 六点(6) = 9
    // 注意：至尊只有先出时才无敌，跟牌时按正常power计算
    const zhiZunCombos = [
      { ids: ['M12', 'M24'], name: '至尊' },
      { ids: ['M24', 'M12'], name: '至尊' }
    ];
    zhiZunCombos.forEach(combo => {
      const card1 = this.gameState.deck.find(c => c.id === combo.ids[0]);
      const card2 = this.gameState.deck.find(c => c.id === combo.ids[1]);
      const power = card1.power + card2.power;  // 3+6=9
      
      const key = this.makePairKey(combo.ids);
      this.combinationMap.pair.set(key, {
        type: 'zhizun',
        name: combo.name,
        power: power,  // 正常power=9
        ids: combo.ids
      });
    });

    // 文至尊（双伶冧六 WL1+WL2）- 25+25=50
    // 注意：只有先出时才强，跟牌时按正常power，但双高脚七(60)可以打它
    const wenZhiZunCombo = { ids: ['WL1', 'WL2'], name: '文至尊' };
    const wcard1 = this.gameState.deck.find(c => c.id === wenZhiZunCombo.ids[0]);
    const wcard2 = this.gameState.deck.find(c => c.id === wenZhiZunCombo.ids[1]);
    const wenZhiZunPower = wcard1.power + wcard2.power;  // 25+25=50
    const wkey = this.makePairKey(wenZhiZunCombo.ids);
    this.combinationMap.pair.set(wkey, {
      type: 'wen_zhizun',
      name: wenZhiZunCombo.name,
      power: wenZhiZunPower,  // 正常power=50
      ids: wenZhiZunCombo.ids
    });

    // === 3. 三张牌组合映射 ===
    this.initializeTripleCombinations();
    
    // === 4. 四张牌组合映射 ===
    this.initializeQuadCombinations();
  }

  // 初始化三张牌组合
  initializeTripleCombinations() {
    // 三张牌组合：只有特定的文武组合才能出三张
    // 包括：三天九、三地八、三人七、三和五
    // 每种有两种形式：2文+1武 或 1文+2武
    // power = 三张牌的power之和
    
    // 三天九
    const tianJiuCombos = [
      // 2天+1九点：100+100+9=209
      { ids: ['WT1', 'WT2', 'M36'], wenCount: 2, name: '三天九' },
      { ids: ['WT1', 'WT2', 'M45'], wenCount: 2, name: '三天九' },
      // 1天+2九点：100+9+9=118
      { ids: ['WT1', 'M36', 'M45'], wenCount: 1, name: '三天九' },
      { ids: ['WT2', 'M36', 'M45'], wenCount: 1, name: '三天九' }
    ];

    // 三地八
    const diBaCombos = [
      // 2地+1八点：90+90+8=188
      { ids: ['WD1', 'WD2', 'M26'], wenCount: 2, name: '三地八' },
      { ids: ['WD1', 'WD2', 'M35'], wenCount: 2, name: '三地八' },
      // 1地+2八点：90+8+8=106
      { ids: ['WD1', 'M26', 'M35'], wenCount: 1, name: '三地八' },
      { ids: ['WD2', 'M26', 'M35'], wenCount: 1, name: '三地八' }
    ];

    // 三人七
    const renQiCombos = [
      // 2人+1七点：80+80+7=167
      { ids: ['WR1', 'WR2', 'M25'], wenCount: 2, name: '三人七' },
      { ids: ['WR1', 'WR2', 'M34'], wenCount: 2, name: '三人七' },
      // 1人+2七点：80+7+7=94
      { ids: ['WR1', 'M25', 'M34'], wenCount: 1, name: '三人七' },
      { ids: ['WR2', 'M25', 'M34'], wenCount: 1, name: '三人七' }
    ];

    // 三和五
    const heWuCombos = [
      // 2和+1五点：70+70+5=145
      { ids: ['WH1', 'WH2', 'M14'], wenCount: 2, name: '三和五' },
      { ids: ['WH1', 'WH2', 'M23'], wenCount: 2, name: '三和五' },
      // 1和+2五点：70+5+5=80
      { ids: ['WH1', 'M14', 'M23'], wenCount: 1, name: '三和五' },
      { ids: ['WH2', 'M14', 'M23'], wenCount: 1, name: '三和五' }
    ];

    const allTriples = [...tianJiuCombos, ...diBaCombos, ...renQiCombos, ...heWuCombos];
    allTriples.forEach(combo => {
      // 计算power = 三张牌的power之和
      const card1 = this.gameState.deck.find(c => c.id === combo.ids[0]);
      const card2 = this.gameState.deck.find(c => c.id === combo.ids[1]);
      const card3 = this.gameState.deck.find(c => c.id === combo.ids[2]);
      const power = card1.power + card2.power + card3.power;
      
      const key = this.makeTripleKey(combo.ids);
      this.combinationMap.triple.set(key, {
        type: 'wenwu_triple',
        name: combo.name,
        wenCount: combo.wenCount,  // 2文+1武 或 1文+2武
        power: power,
        ids: combo.ids
      });
    });

    console.log('组合映射表初始化完成');
    console.log('- 单张牌：', this.combinationMap.single.size);
    console.log('- 两张牌：', this.combinationMap.pair.size);
    console.log('- 三张牌：', this.combinationMap.triple.size);
    console.log('- 四张牌：', this.combinationMap.quad.size);
  }

  // 初始化四张牌组合（2文+2武）
  initializeQuadCombinations() {
    // 四张牌组合：只有特定的文武组合才能出四张
    // 包括：四天九、四地八、四人七、四和五
    // 形式：2文+2武（必须是相同的文武对组合）
    // power = 四张牌的power之和
    
    // 四天九：2天+2九点
    const tianJiuQuads = [
      { ids: ['WT1', 'WT2', 'M36', 'M45'], name: '四天九' }
    ];

    // 四地八：2地+2八点
    const diBaQuads = [
      { ids: ['WD1', 'WD2', 'M26', 'M35'], name: '四地八' }
    ];

    // 四人七：2人+2七点
    const renQiQuads = [
      { ids: ['WR1', 'WR2', 'M25', 'M34'], name: '四人七' }
    ];

    // 四和五：2和+2五点
    const heWuQuads = [
      { ids: ['WH1', 'WH2', 'M14', 'M23'], name: '四和五' }
    ];

    const allQuads = [...tianJiuQuads, ...diBaQuads, ...renQiQuads, ...heWuQuads];
    allQuads.forEach(combo => {
      // 计算power = 四张牌的power之和
      const card1 = this.gameState.deck.find(c => c.id === combo.ids[0]);
      const card2 = this.gameState.deck.find(c => c.id === combo.ids[1]);
      const card3 = this.gameState.deck.find(c => c.id === combo.ids[2]);
      const card4 = this.gameState.deck.find(c => c.id === combo.ids[3]);
      const power = card1.power + card2.power + card3.power + card4.power;
      
      const key = this.makeQuadKey(combo.ids);
      this.combinationMap.quad.set(key, {
        type: 'wenwu_quad',
        name: combo.name,
        power: power,
        ids: combo.ids
      });
    });
  }

  // 生成两张牌的组合key（ID排序后用-连接）
  makePairKey(ids) {
    return [...ids].sort().join('-');
  }

  // 生成三张牌的组合key
  makeTripleKey(ids) {
    return [...ids].sort().join('-');
  }

  // 生成四张牌的组合key
  makeQuadKey(ids) {
    return [...ids].sort().join('-');
  }

  // 查询牌型组合
  findCombination(cards) {
    if (!cards || cards.length === 0) return null;
    
    if (!this.combinationMap) {
      console.error('错误：combinationMap 未初始化！');
      return null;
    }

    const ids = cards.map(c => c.id);

    if (cards.length === 1) {
      const result = this.combinationMap.single.get(ids[0]);
      if (!result) {
        console.log(`警告：单张牌 ${ids[0]} 在映射表中未找到`);
      }
      return result;
    } else if (cards.length === 2) {
      const key = this.makePairKey(ids);
      let result = this.combinationMap.pair.get(key);
      
      if (!result) {
        // 尝试动态识别文武对
        const wenCard = cards.find(c => c.type === 'wen');
        const wuCard = cards.find(c => c.type === 'wu');
        
        if (wenCard && wuCard) {
          // 检查是否是天九、地八、人七、和五
          const wenWuPairs = {
            '天-9': '天九',
            '地-8': '地八',
            '人-7': '人七',
            '和-5': '和五'
          };
          
          const pairKey = `${wenCard.name}-${wuCard.points}`;
          if (wenWuPairs[pairKey]) {
            console.log(`动态识别文武对：${pairKey} = ${wenWuPairs[pairKey]}`);
            result = {
              type: 'wenwu_pair',
              name: wenWuPairs[pairKey],
              power: wenCard.power + wuCard.power,
              ids: ids
            };
          }
        }
        
        // 检查是否是文对或武对
        if (!result && cards[0].type === cards[1].type) {
          if (cards[0].name === cards[1].name) {
            // 同名牌对子
            const pairName = cards[0].type === 'wen' ? `双${cards[0].name}` : `杂${cards[0].points}`;
            console.log(`动态识别对子：${pairName}`);
            result = {
              type: cards[0].type === 'wen' ? 'wen_pair' : 'wu_pair',
              name: pairName,
              power: cards[0].power + cards[1].power,
              ids: ids
            };
          }
        }
      }
      
      if (!result) {
        console.log(`警告：组合 ${key} (${cards[0].name}+${cards[1].name}) 在映射表中未找到`);
        console.log(`牌的详细信息：ID=${ids[0]}(${cards[0].name},power=${cards[0].power}) + ID=${ids[1]}(${cards[1].name},power=${cards[1].power})`);
        console.log(`可用的组合数量：${this.combinationMap.pair.size}`);
      }
      return result;
    } else if (cards.length === 3) {
      const key = this.makeTripleKey(ids);
      const result = this.combinationMap.triple.get(key);
      if (!result) {
        console.log(`警告：三张组合 ${key} 在映射表中未找到`);
      }
      return result;
    } else if (cards.length === 4) {
      const key = this.makeQuadKey(ids);
      const result = this.combinationMap.quad.get(key);
      if (!result) {
        console.log(`警告：四张组合 ${key} 在映射表中未找到`);
      }
      return result;
    }

    return null;
  }

  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  dealCards() {
    // 每人发8张牌
    this.gameState.hands = [[], [], [], []];
    for (let i = 0; i < 32; i++) {
      const playerIndex = i % 4;
      this.gameState.hands[playerIndex].push(this.gameState.deck[i]);
    }
  }

  getPublicGameState() {
    return {
      started: this.gameState.started,
      currentPlayer: this.gameState.currentPlayer,
      currentRound: this.gameState.currentRound,
      playerCount: this.players.length,
      players: this.players.map(p => ({ name: p.playerName, ready: p.ready })),
      currentDong: this.gameState.currentDong,
      gameOver: this.gameState.gameOver,
      winner: this.gameState.winner,
      dongScores: this.gameState.dongScores
    };
  }

  // 验证出牌是否合法
  validatePlay(cards, playerIndex) {
    if (!cards || cards.length === 0) {
      return { valid: false, error: '请选择要出的牌' };
    }

    // 检查牌是否在玩家手中
    const hand = this.gameState.hands[playerIndex];
    for (const card of cards) {
      if (!hand.find(c => c.id === card.id)) {
        return { valid: false, error: '您没有这张牌' };
      }
    }

    // 如果是第一个出牌，检查组合是否合法
    if (this.gameState.currentDong.length === 0) {
      return this.validateFirstPlay(cards);
    } else {
      // 跟牌，需要检查是否符合要求
      return this.validateFollowPlay(cards);
    }
  }

  validateFirstPlay(cards) {
    // 使用组合映射表验证
    const combo = this.findCombination(cards);
    
    if (!combo) {
      if (cards.length === 1) {
        return { valid: false, error: '无效的牌' };
      } else if (cards.length === 2) {
        return { valid: false, error: '两张牌必须是文对、武对、文武对或特殊组合' };
      } else if (cards.length === 3) {
        return { valid: false, error: '三张牌必须是有效的文武组合（如：三人七）' };
      } else if (cards.length === 4) {
        return { valid: false, error: '四张牌必须是有效的文武组合（如：四人七）' };
      } else {
        return { valid: false, error: '一次只能出1张、2张、3张或4张牌' };
      }
    }

    // 标记这是先出牌，用于特殊规则判断
    combo.isFirstPlay = true;
    
    return { valid: true, combo: combo };
  }

  // 判断两张牌的对子类型
  getPairType(cards) {
    if (cards.length !== 2) return null;

    const card1 = cards[0];
    const card2 = cards[1];

    // 文对：两张相同名称的文牌
    if (card1.type === 'wen' && card2.type === 'wen' && card1.name === card2.name) {
      return 'wen'; // 文对
    }

    // 武对：两张相同点数的武牌
    if (card1.type === 'wu' && card2.type === 'wu') {
      const points1 = card1.points;
      const points2 = card2.points;
      
      // 检查是否是相同点数
      if (points1 === points2) {
        return 'wu'; // 武对
      }
    }

    // 文武对：文牌+武牌的特定组合
    if ((card1.type === 'wen' && card2.type === 'wu') || (card1.type === 'wu' && card2.type === 'wen')) {
      const wenCard = card1.type === 'wen' ? card1 : card2;
      const wuCard = card1.type === 'wu' ? card1 : card2;
      
      // 天九：天 + 九点
      if (wenCard.name === '天' && wuCard.points === 9) {
        return 'wenwu'; // 文武对
      }
      // 地八：地 + 八点
      if (wenCard.name === '地' && wuCard.points === 8) {
        return 'wenwu';
      }
      // 人七：人 + 七点
      if (wenCard.name === '人' && wuCard.points === 7) {
        return 'wenwu';
      }
      // 和五：和 + 五点
      if (wenCard.name === '和' && wuCard.points === 5) {
        return 'wenwu';
      }
    }

    return null; // 不是有效的对子
  }

  // 检查3张牌的文武组合（如：三人七 = 两个人+一个七，或一个人+两个七）
  getTripleWenWuType(cards) {
    if (cards.length !== 3) return null;

    // 统计文牌和武牌的数量
    const wenCards = cards.filter(c => c.type === 'wen');
    const wuCards = cards.filter(c => c.type === 'wu');

    // 必须是2文+1武 或 1文+2武
    if ((wenCards.length === 2 && wuCards.length === 1) || 
        (wenCards.length === 1 && wuCards.length === 2)) {
      
      // 检查是否是有效的文武组合
      // 天九：天 + 九点
      if (this.checkTripleWenWu(wenCards, wuCards, '天', 9)) {
        return { type: 'tianJiu', name: '三天九', wenName: '天', wuPoints: 9 };
      }
      // 地八：地 + 八点
      if (this.checkTripleWenWu(wenCards, wuCards, '地', 8)) {
        return { type: 'diBa', name: '三地八', wenName: '地', wuPoints: 8 };
      }
      // 人七：人 + 七点
      if (this.checkTripleWenWu(wenCards, wuCards, '人', 7)) {
        return { type: 'renQi', name: '三人七', wenName: '人', wuPoints: 7 };
      }
      // 和五：和 + 五点
      if (this.checkTripleWenWu(wenCards, wuCards, '和', 5)) {
        return { type: 'heWu', name: '三和五', wenName: '和', wuPoints: 5 };
      }
    }

    return null;
  }

  // 辅助函数：检查3张牌是否符合特定的文武组合
  checkTripleWenWu(wenCards, wuCards, wenName, wuPoints) {
    // 2文+1武的情况
    if (wenCards.length === 2 && wuCards.length === 1) {
      return wenCards.every(c => c.name === wenName) && 
             wuCards[0].points === wuPoints;
    }
    // 1文+2武的情况
    if (wenCards.length === 1 && wuCards.length === 2) {
      return wenCards[0].name === wenName && 
             wuCards.every(c => c.points === wuPoints);
    }
    return false;
  }

  // 检查特殊组合
  checkSpecialCombination(cards) {
    if (cards.length !== 2) {
      return { isSpecial: false };
    }

    const card1 = cards[0];
    const card2 = cards[1];

    // 至尊(武尊/至尊宝)：三鸡(M12) + 大头六(M24)
    if (card1.type === 'wu' && card2.type === 'wu') {
      const ids = [card1.id, card2.id].sort();
      // 检查是否是M12和M24的组合
      if ((ids[0] === 'M12' && ids[1] === 'M24') || 
          (card1.points === 3 && card2.points === 6) ||
          (card1.points === 6 && card2.points === 3)) {
        return { isSpecial: true, type: 'zhiZun', name: '至尊' };
      }
    }

    // 文至尊：双伶冧六（WL1 + WL2）- 这是特殊玩法，可以被高脚七擒
    if (card1.type === 'wen' && card2.type === 'wen' && 
        card1.name === '伶冧六' && card2.name === '伶冧六') {
      return { isSpecial: true, type: 'wenZhiZun', name: '文至尊' };
    }

    return { isSpecial: false };
  }

  validateFollowPlay(cards) {
    const activePlays = this.gameState.currentDong.filter(d => d.cards && d.cards.length > 0);
    if (activePlays.length === 0) {
      return { valid: false, error: '没有需要跟的牌' };
    }

    // 找到最后一个非过牌的有效出牌作为比较基准
    let lastValidPlay = null;
    for (let i = activePlays.length - 1; i >= 0; i--) {
      if (!activePlays[i].passed) {
        lastValidPlay = activePlays[i];
        break;
      }
    }
    
    // 如果所有人都过牌了，说明没有有效出牌，不应该发生
    if (!lastValidPlay) {
      return { valid: false, error: '没有有效的出牌可以比较' };
    }
    
    const requiredCount = lastValidPlay.cards.length;

    // 牌数必须相同
    if (cards.length !== requiredCount) {
      return { valid: false, error: `需要出${requiredCount}张牌` };
    }

    // 查询当前出牌和上一个有效出牌的组合
    const currentCombo = this.findCombination(cards);
    const lastCombo = this.findCombination(lastValidPlay.cards);

    if (!currentCombo) {
      return { valid: false, error: '无效的牌型组合' };
    }

    if (!lastCombo) {
      return { valid: false, error: '上家出牌异常' };
    }

    // 单张牌逻辑
    if (requiredCount === 1) {
      console.log(`单张牌验证: 当前牌=${currentCombo.name}(cardType=${currentCombo.cardType}, power=${currentCombo.power}), 上家牌=${lastCombo.name}(cardType=${lastCombo.cardType}, power=${lastCombo.power})`);
      
      // 必须是同类型（文打文，武打武）
      if (currentCombo.cardType !== lastCombo.cardType) {
        return { valid: false, error: '必须出同类型的牌（文打文，武打武）' };
      }
      
      // 比较power（先出为大：相同牌也无法打）
      if (currentCombo.power <= lastCombo.power) {
        if (currentCombo.power === lastCombo.power) {
          return { valid: false, error: '相同的牌，先出为大，无法打出' };
        }
        return { valid: false, error: '您的牌不够大' };
      }
      
      return { valid: true, combo: currentCombo };
    }

    // 两张牌逻辑
    if (requiredCount === 2) {
      // 特殊规则1：至尊只有先出时才无敌
      // 如果上家先出至尊，则无法打败
      if (lastCombo.type === 'zhizun' && lastCombo.isFirstPlay) {
        return { valid: false, error: '至尊先出无敌，无法打败' };
      }

      // 如果当前出至尊，但不是先出（在跟牌），则按正常power=9计算
      // 至尊跟牌时power=9，基本打不过任何对子
      if (currentCombo.type === 'zhizun') {
        // 检查能否打过上家（按正常power比较）
        if (currentCombo.power <= lastCombo.power) {
          return { valid: false, error: `至尊跟牌时power=${currentCombo.power}，无法打过上家(power=${lastCombo.power})` };
        }
        return { valid: true, combo: currentCombo };
      }

      // 特殊规则2：文至尊先出时，只有双高脚七能打
      if (lastCombo.type === 'wen_zhizun' && lastCombo.isFirstPlay) {
        const isGaoJiaoQi = this.makePairKey(cards.map(c => c.id)) === 'WG1-WG2';
        if (isGaoJiaoQi) {
          return { valid: true, combo: currentCombo };
        }
        return { valid: false, error: '文至尊先出时，只有双高脚七能打' };
      }

      // 当前出文至尊，但在跟牌，则按正常power=50计算
      if (currentCombo.type === 'wen_zhizun') {
        if (currentCombo.power <= lastCombo.power) {
          return { valid: false, error: `文至尊跟牌时power=${currentCombo.power}，无法打过上家(power=${lastCombo.power})` };
        }
        return { valid: true, combo: currentCombo };
      }

      // 普通对子：必须同类型（文对、武对、文武对）
      if (currentCombo.type !== lastCombo.type) {
        const typeNames = {
          'wen_pair': '文对',
          'wu_pair': '武对',
          'wenwu_pair': '文武对'
        };
        const lastTypeName = typeNames[lastCombo.type] || lastCombo.type;
        const currentTypeName = typeNames[currentCombo.type] || currentCombo.type;
        return { valid: false, error: `上家出的是${lastTypeName}，您出的是${currentTypeName}，类型不匹配` };
      }

      // 比较power值（先出为大：相同power也无法打）
      if (currentCombo.power <= lastCombo.power) {
        if (currentCombo.power === lastCombo.power) {
          return { valid: false, error: `相同的${currentCombo.name}，先出为大，无法打出` };
        }
        return { valid: false, error: `您的${currentCombo.name}(power=${currentCombo.power})打不过上家的${lastCombo.name}(power=${lastCombo.power})` };
      }

      return { valid: true, combo: currentCombo };
    }

    // 三张牌逻辑
    if (requiredCount === 3) {
      // 三张牌必须同wenCount（2文+1武 vs 2文+1武，或 1文+2武 vs 1文+2武）
      if (currentCombo.wenCount !== lastCombo.wenCount) {
        const currentDesc = currentCombo.wenCount === 2 ? '2文+1武' : '1文+2武';
        const lastDesc = lastCombo.wenCount === 2 ? '2文+1武' : '1文+2武';
        return { valid: false, error: `上家出的是${lastDesc}，您出的是${currentDesc}，类型不匹配` };
      }

      // 比较power值（先出为大：相同power也无法打）
      if (currentCombo.power <= lastCombo.power) {
        if (currentCombo.power === lastCombo.power) {
          return { valid: false, error: `相同的${currentCombo.name}，先出为大，无法打出` };
        }
        return { valid: false, error: `您的${currentCombo.name}(power=${currentCombo.power})打不过上家的${lastCombo.name}(power=${lastCombo.power})` };
      }

      return { valid: true, combo: currentCombo };
    }

    // 四张牌逻辑
    if (requiredCount === 4) {
      // 四张牌必须都是同类型的文武组合（四天九、四地八、四人七、四和五）
      if (currentCombo.type !== lastCombo.type || currentCombo.type !== 'wenwu_quad') {
        return { valid: false, error: '四张牌必须是相同类型的文武组合' };
      }

      // 比较power值（先出为大：相同power也无法打）
      if (currentCombo.power <= lastCombo.power) {
        if (currentCombo.power === lastCombo.power) {
          return { valid: false, error: `相同的${currentCombo.name}，先出为大，无法打出` };
        }
        return { valid: false, error: `您的${currentCombo.name}(power=${currentCombo.power})打不过上家的${lastCombo.name}(power=${lastCombo.power})` };
      }

      return { valid: true, combo: currentCombo };
    }

    return { valid: false, error: '无效的牌数' };
  }

  // 判断两张牌的对子类型（已废弃，使用combinationMap代替，保留用于兼容）
  getPairType(cards) {
    const combo = this.findCombination(cards);
    if (!combo) return null;
    
    if (combo.type === 'wen_pair') return 'wen';
    if (combo.type === 'wu_pair') return 'wu';
    if (combo.type === 'wenwu_pair') return 'wenwu';
    
    return null;
  }

  // 检查3张牌的文武组合（已废弃，使用combinationMap代替，保留用于兼容）
  getTripleWenWuType(cards) {
    const combo = this.findCombination(cards);
    if (!combo || combo.type !== 'wenwu_triple') return null;
    
    return {
      type: combo.name,
      name: combo.name,
      power: combo.power,
      wenCount: combo.wenCount
    };
  }

  // 检查特殊组合（已废弃，使用combinationMap代替，保留用于兼容）
  checkSpecialCombination(cards) {
    const combo = this.findCombination(cards);
    if (!combo) return { isSpecial: false };
    
    if (combo.type === 'zhizun') {
      return { isSpecial: true, type: 'zhiZun', name: '至尊' };
    }
    if (combo.type === 'wen_zhizun') {
      return { isSpecial: true, type: 'wenZhiZun', name: '文至尊' };
    }
    
    return { isSpecial: false };
  }

  // 机器人自动出牌
  botAutoPlay() {
    const currentPlayer = this.players[this.gameState.currentPlayer];
    if (!currentPlayer || !currentPlayer.isBot) {
      return;
    }

    // 检查机器人是否被OUT
    if (this.gameState.outPlayers[this.gameState.currentPlayer]) {
      console.log(`机器人${this.gameState.currentPlayer}已被OUT，自动过牌`);
      setTimeout(() => {
        this.processBotPass(this.gameState.currentPlayer);
      }, 500);
      return;
    }

    setTimeout(() => {
      const hand = this.gameState.hands[this.gameState.currentPlayer];
      
      if (hand.length === 0) return;

      // 简单的机器人策略
      let cardsToPlay = [];
      
      if (this.gameState.currentDong.length === 0) {
        // 第一个出牌，出最小的单张或对子
        cardsToPlay = this.getBotFirstPlay(hand);
      } else {
        // 跟牌
        cardsToPlay = this.getBotFollowPlay(hand);
      }

      if (cardsToPlay.length > 0) {
        // 机器人出牌
        this.processBotPlay(this.gameState.currentPlayer, cardsToPlay);
      } else {
        // 机器人过牌
        this.processBotPass(this.gameState.currentPlayer);
      }
    }, 1000 + Math.random() * 1500); // 随机延迟1-2.5秒，模拟思考时间
  }

  getBotFirstPlay(hand) {
    // 遍历所有可能的两张牌组合，找出有效的对子
    const validPairs = [];
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        const testCards = [hand[i], hand[j]];
        const combo = this.findCombination(testCards);
        
        if (combo && (combo.type === 'wen_pair' || combo.type === 'wu_pair' || 
                      combo.type === 'wenwu_pair' || combo.type === 'zhizun' || 
                      combo.type === 'wen_zhizun')) {
          validPairs.push({ cards: testCards, combo: combo });
        }
      }
    }
    
    if (validPairs.length > 0) {
      // 出power最小的对子
      const sorted = validPairs.sort((a, b) => a.combo.power - b.combo.power);
      console.log(`机器人首次出牌：选择${sorted[0].combo.name}(power ${sorted[0].combo.power})`);
      return sorted[0].cards;
    }
    
    // 没有对子，出power最小的单张
    const cardsWithPower = hand.map(c => ({
      card: c,
      combo: this.findCombination([c])
    })).filter(item => item.combo);
    
    if (cardsWithPower.length > 0) {
      const sorted = cardsWithPower.sort((a, b) => a.combo.power - b.combo.power);
      console.log(`机器人首次出牌：选择${sorted[0].card.name}(power ${sorted[0].combo.power})`);
      return [sorted[0].card];
    }
    
    // 兜底：随便出一张
    return [hand[0]];
  }

  getBotFollowPlay(hand) {
    const activePlays = this.gameState.currentDong.filter(d => d.cards && d.cards.length > 0);
    if (activePlays.length === 0) return [];

    // 找到最后一个非过牌的有效出牌作为比较基准
    let lastPlay = null;
    for (let i = activePlays.length - 1; i >= 0; i--) {
      if (!activePlays[i].passed) {
        lastPlay = activePlays[i];
        break;
      }
    }
    
    // 如果所有人都过牌了，说明没有有效出牌
    if (!lastPlay) {
      return [];
    }
    
    const requiredCount = lastPlay.cards.length;
    
    // 获取上家的组合信息
    const lastCombo = this.findCombination(lastPlay.cards);
    if (!lastCombo) {
      console.log('机器人：无法识别上家的牌型');
      return [];
    }

    console.log(`机器人跟牌: 上家出了 ${lastCombo.name || '未知'}(power ${lastCombo.power})`);

    // 单张牌逻辑
    if (requiredCount === 1) {
      // 找出同类型且power更大的牌
      const biggerCards = hand.filter(c => {
        const combo = this.findCombination([c]);
        return combo && 
               combo.cardType === lastCombo.cardType && 
               combo.power > lastCombo.power;
      });
      
      console.log(`机器人手中能打的牌: ${biggerCards.map(c => `${c.name}(power ${c.power})`).join(', ')}`);
      
      // 40%概率不出大牌
      if (biggerCards.length > 0 && Math.random() > 0.4) {
        // 找power最小的（刚好能打过）
        const sorted = biggerCards.map(c => ({
          card: c,
          combo: this.findCombination([c])
        })).sort((a, b) => a.combo.power - b.combo.power);
        
        console.log(`机器人决定出: ${sorted[0].card.name}(power ${sorted[0].combo.power})`);
        return [sorted[0].card];
      } else {
        console.log(`机器人决定过牌 (${biggerCards.length > 0 ? '有牌但概率判断不出' : '没有能打的牌'})`);
      }
      return [];
    }

    // 两张牌逻辑
    if (requiredCount === 2) {
      // 遍历所有可能的两张牌组合
      const validPairs = [];
      for (let i = 0; i < hand.length; i++) {
        for (let j = i + 1; j < hand.length; j++) {
          const testCards = [hand[i], hand[j]];
          const combo = this.findCombination(testCards);
          
          if (!combo) continue;
          
          // 特殊处理至尊
          if (combo.type === 'zhizun') {
            validPairs.push({ cards: testCards, combo: combo });
            continue;
          }
          
          // 特殊处理文至尊
          if (combo.type === 'wen_zhizun') {
            if (lastCombo.type !== 'zhizun') {
              validPairs.push({ cards: testCards, combo: combo });
            }
            continue;
          }
          
          // 普通对子：同类型且power更大
          if (combo.type === lastCombo.type && combo.power > lastCombo.power) {
            validPairs.push({ cards: testCards, combo: combo });
          }
        }
      }
      
      console.log(`机器人找到${validPairs.length}个可打的对子`);
      
      // 30%概率不出
      if (validPairs.length > 0 && Math.random() > 0.3) {
        // 选择power最小的（刚好能打过）
        const sorted = validPairs.sort((a, b) => a.combo.power - b.combo.power);
        console.log(`机器人决定出: ${sorted[0].combo.name}(power ${sorted[0].combo.power})`);
        return sorted[0].cards;
      }
      return [];
    }

    // 三张牌逻辑
    if (requiredCount === 3) {
      if (lastCombo.type !== 'wenwu_triple') return [];
      
      const validTriples = [];
      for (let i = 0; i < hand.length; i++) {
        for (let j = i + 1; j < hand.length; j++) {
          for (let k = j + 1; k < hand.length; k++) {
            const testCards = [hand[i], hand[j], hand[k]];
            const combo = this.findCombination(testCards);
            
            if (!combo || combo.type !== 'wenwu_triple') continue;
            
            // 必须同文武数配比且power更大
            if (combo.wenCount === lastCombo.wenCount && combo.power > lastCombo.power) {
              validTriples.push({ cards: testCards, combo: combo });
            }
          }
        }
      }
      
      console.log(`机器人找到${validTriples.length}个可打的三张组合`);
      
      // 30%概率不出
      if (validTriples.length > 0 && Math.random() > 0.3) {
        const sorted = validTriples.sort((a, b) => a.combo.power - b.combo.power);
        console.log(`机器人决定出: ${sorted[0].combo.name}(power ${sorted[0].combo.power})`);
        return sorted[0].cards;
      }
      return [];
    }

    return [];
  }

  // 获取对子的power值（用于比较）
  getPairPower(cards, pairType) {
    // 直接返回两张牌的power之和
    return cards[0].power + cards[1].power;
  }

  findPairs(hand) {
    const pairs = [];
    const counted = new Set();

    // 1. 文对：相同名称的两张文牌
    for (let i = 0; i < hand.length; i++) {
      if (counted.has(hand[i].id)) continue;
      if (hand[i].type !== 'wen') continue;
      
      for (let j = i + 1; j < hand.length; j++) {
        if (counted.has(hand[j].id)) continue;
        if (hand[j].type !== 'wen') continue;
        
        if (hand[i].name === hand[j].name) {
          pairs.push({
            cards: [hand[i], hand[j]],
            type: 'wen',
            name: hand[i].name
          });
          counted.add(hand[i].id);
          counted.add(hand[j].id);
          break;
        }
      }
    }

    // 2. 武对：相同点数的两张武牌
    // 需要找到两张点数相同但组合不同的武牌
    const wuCards = hand.filter(c => c.type === 'wu' && !counted.has(c.id));
    const wuByPoints = {};
    
    wuCards.forEach(card => {
      const points = card.points;
      if (!wuByPoints[points]) {
        wuByPoints[points] = [];
      }
      wuByPoints[points].push(card);
    });

    // 找出有两张的点数
    Object.keys(wuByPoints).forEach(points => {
      const cards = wuByPoints[points];
      if (cards.length >= 2) {
        // 确保两张牌的id不同（不同组合）
        if (cards[0].id !== cards[1].id) {
          pairs.push({
            cards: [cards[0], cards[1]],
            type: 'wu',
            power: cards[0].power + cards[1].power
          });
          counted.add(cards[0].id);
          counted.add(cards[1].id);
        }
      }
    });

    // 3. 文武对：文牌+武牌的特定组合
    const wenCards = hand.filter(c => c.type === 'wen' && !counted.has(c.id));
    const wuCardsRemaining = hand.filter(c => c.type === 'wu' && !counted.has(c.id));

    // 天九：天 + 九点
    const tianPai = wenCards.find(c => c.name === '天');
    const jiu = wuCardsRemaining.find(c => c.points === 9);
    if (tianPai && jiu) {
      pairs.push({
        cards: [tianPai, jiu],
        type: 'wenwu',
        power: tianPai.power + jiu.power
      });
      counted.add(tianPai.id);
      counted.add(jiu.id);
    }

    // 地八：地 + 八点
    const diPai = wenCards.find(c => c.name === '地' && !counted.has(c.id));
    const ba = wuCardsRemaining.find(c => c.points === 8 && !counted.has(c.id));
    if (diPai && ba) {
      pairs.push({
        cards: [diPai, ba],
        type: 'wenwu',
        power: diPai.power + ba.power
      });
      counted.add(diPai.id);
      counted.add(ba.id);
    }

    // 人七：人 + 七点
    const renPai = wenCards.find(c => c.name === '人' && !counted.has(c.id));
    const qi = wuCardsRemaining.find(c => c.points === 7 && !counted.has(c.id));
    if (renPai && qi) {
      pairs.push({
        cards: [renPai, qi],
        type: 'wenwu',
        power: renPai.power + qi.power
      });
      counted.add(renPai.id);
      counted.add(qi.id);
    }

    // 和五：和 + 五点
    const hePai = wenCards.find(c => c.name === '和' && !counted.has(c.id));
    const wu = wuCardsRemaining.find(c => c.points === 5 && !counted.has(c.id));
    if (hePai && wu) {
      pairs.push({
        cards: [hePai, wu],
        type: 'wenwu',
        power: hePai.power + wu.power
      });
      counted.add(hePai.id);
      counted.add(wu.id);
    }

    // 按power排序返回（power越大越强）
    return pairs.sort((a, b) => b.power - a.power);
  }

  processBotPlay(playerIndex, cards) {
    // 检查玩家是否存在
    if (!this.players[playerIndex]) {
      console.error(`玩家 ${playerIndex} 不存在`);
      return;
    }

    // 验证机器人的出牌是否合法
    const validation = this.validatePlay(cards, playerIndex);
    if (!validation.valid) {
      console.error(`机器人 ${playerIndex} 出牌无效: ${validation.error}`);
      // 机器人出牌无效，改为过牌
      this.processBotPass(playerIndex);
      return;
    }

    // 从手牌中移除
    cards.forEach(card => {
      const index = this.gameState.hands[playerIndex].findIndex(c => c.id === card.id);
      if (index !== -1) {
        this.gameState.hands[playerIndex].splice(index, 1);
      }
    });

    const playerId = this.players[playerIndex].playerId;

    // 添加到当前栋
    this.gameState.currentDong.push({
      playerId,
      playerIndex,
      cards
    });

    this.broadcast({
      type: 'cardsPlayed',
      playerId,
      playerIndex,
      cards,
      currentDong: this.gameState.currentDong,
      handCounts: this.gameState.hands.map(h => h.length)
    });

    // 检查是否该结束这一栋
    this.checkDongEnd();
  }

  processBotPass(playerIndex) {
    const playerId = this.players[playerIndex].playerId;
    const hand = this.gameState.hands[playerIndex];

    // 如果玩家被OUT，不丢弃牌，直接记录过牌
    if (this.gameState.outPlayers[playerIndex]) {
      this.gameState.currentDong.push({
        playerId,
        playerIndex,
        cards: [],
        passed: true
      });

      this.broadcast({
        type: 'playerPassed',
        playerId,
        playerIndex,
        discardedCards: [],
        currentDong: this.gameState.currentDong,
        handCounts: this.gameState.hands.map(h => h.length)
      });

      this.checkDongEnd();
      return;
    }

    // 过牌时需要丢弃与首家相同数量的牌
    const firstPlay = this.gameState.currentDong.find(play => !play.passed);
    const discardCount = firstPlay ? firstPlay.cards.length : 0;
    
    // 随机选择要丢弃的牌
    const discardedCards = [];
    for (let i = 0; i < discardCount && hand.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * hand.length);
      discardedCards.push(hand.splice(randomIndex, 1)[0]);
    }

    this.gameState.currentDong.push({
      playerId,
      playerIndex,
      cards: discardedCards,
      passed: true
    });

    this.broadcast({
      type: 'playerPassed',
      playerId,
      playerIndex,
      discardedCards,
      handCounts: this.gameState.hands.map(h => h.length)
    });

    // 检查是否该结束这一栋
    this.checkDongEnd();
  }

  checkDongEnd() {
    // 如果这是首次出牌，记录首家
    if (this.gameState.currentDong.length === 1) {
      this.gameState.dongFirstPlayer = this.gameState.currentDong[0].playerIndex;
    }

    // 获取首家的上一家（逆时针方向）
    const counterClockwiseOrder = [0, 2, 3, 1];
    const firstPlayerIndex = counterClockwiseOrder.indexOf(this.gameState.dongFirstPlayer);
    const beforeFirstIndex = (firstPlayerIndex - 1 + 4) % 4;
    const beforeFirstPlayer = counterClockwiseOrder[beforeFirstIndex];

    // 如果当前玩家是首家的上一家，并且已经出牌或过牌，则结束这一栋
    if (this.gameState.currentPlayer === beforeFirstPlayer && this.gameState.currentDong.length > 0) {
      setTimeout(() => {
        this.determineDongWinner();
      }, 1500);
      return true;
    }

    // 继续下一个玩家（逆时针）
    this.gameState.currentPlayer = this.getNextPlayerCounterClockwise(this.gameState.currentPlayer);
    
    // 如果下一个玩家被OUT，自动过牌
    if (this.gameState.outPlayers[this.gameState.currentPlayer]) {
      console.log(`玩家${this.gameState.currentPlayer}已被OUT，自动过牌`);
      this.gameState.currentDong.push({
        playerId: this.players[this.gameState.currentPlayer]?.playerId || `player${this.gameState.currentPlayer}`,
        playerIndex: this.gameState.currentPlayer,
        cards: [],
        passed: true
      });
      
      this.broadcast({
        type: 'playerPassed',
        playerIndex: this.gameState.currentPlayer,
        currentDong: this.gameState.currentDong
      });
      
      // 递归检查是否结束或继续下一个玩家
      return this.checkDongEnd();
    }
    
    this.broadcast({
      type: 'turnChange',
      currentPlayer: this.gameState.currentPlayer
    });

    // 如果下一个玩家是机器人，触发自动出牌
    this.botAutoPlay();
    return false;
  }

  determineDongWinner() {
    const activePlays = this.gameState.currentDong.filter(d => d.cards && d.cards.length > 0);
    
    if (activePlays.length === 0) {
      return;
    }

    // 只考虑非过牌的有效出牌
    const validPlays = activePlays.filter(play => !play.passed);
    
    if (validPlays.length === 0) {
      // 所有人都过牌，不应该发生
      console.error('错误：所有人都过牌了');
      return;
    }

    // 获取首家（第一个有效出牌的）
    const firstPlay = validPlays[0];
    const firstCombo = this.findCombination(firstPlay.cards);
    
    let winnerPlay = firstPlay;
    let zhiZunInfo = null;

    // 检查是否是单张牌的情况（用于最后一张牌且无栋数的特殊规则）
    const isSingleCard = firstPlay.cards.length === 1;

    // 至尊先出规则：只有先出时才无敌
    if (firstCombo && firstCombo.type === 'zhizun') {
      // 至尊先出，无人能打，首家直接获胜
      winnerPlay = firstPlay;
      console.log('至尊先出，首家获胜');
    }
    // 文至尊先出规则：只有双高脚七能打
    else if (firstCombo && firstCombo.type === 'wen_zhizun') {
      // 检查是否有人用双高脚七打
      let gaoJiaoQiPlay = null;
      for (let i = 1; i < validPlays.length; i++) {
        const combo = this.findCombination(validPlays[i].cards);
        // 双高脚七：WG1+WG2
        if (combo && combo.type === 'wen_pair' && 
            validPlays[i].cards[0].name === '高脚七' && 
            validPlays[i].cards[1].name === '高脚七') {
          gaoJiaoQiPlay = validPlays[i];
          break;
        }
      }
      
      if (gaoJiaoQiPlay) {
        winnerPlay = gaoJiaoQiPlay;
        console.log('双高脚七打败文至尊');
      } else {
        winnerPlay = firstPlay;
        console.log('文至尊先出，无人能打，首家获胜');
      }
    }
    // 普通情况：只比较非过牌的有效出牌，找power最大的
    else {
      // 特殊规则：最后一张牌且无栋数的玩家，在单张牌时power视为0
      
      // 先检查首家是否符合"最后一张且无栋数"的条件
      let winnerPower = firstCombo ? firstCombo.power : 0;
      if (isSingleCard) {
        const firstPlayerIndex = firstPlay.playerIndex;
        if (this.gameState.hands[firstPlayerIndex].length === 1 && 
            this.gameState.dongScores[firstPlayerIndex] === 0) {
          winnerPower = 0;
          // 标记玩家为OUT状态
          if (!this.gameState.outPlayers[firstPlayerIndex]) {
            this.gameState.outPlayers[firstPlayerIndex] = true;
            this.broadcast({
              type: 'playerOut',
              playerIndex: firstPlayerIndex
            });
          }
          console.log(`玩家${firstPlayerIndex}(首家)最后一张牌且无栋数，单张牌时power视为0，自动弃权`);
        }
      }
      
      for (let i = 1; i < validPlays.length; i++) {
        const currentCombo = this.findCombination(validPlays[i].cards);
        const winnerCombo = this.findCombination(winnerPlay.cards);
        
        if (currentCombo && winnerCombo) {
          // 计算当前玩家的实际power（考虑最后一张牌且无栋数的惩罚）
          let currentPower = currentCombo.power;
          
          // 如果是单张牌，检查当前玩家是否符合"最后一张且无栋数"的条件
          if (isSingleCard) {
            const currentPlayerIndex = validPlays[i].playerIndex;
            
            // 当前玩家：只剩1张牌且本局无栋数
            if (this.gameState.hands[currentPlayerIndex].length === 1 && 
                this.gameState.dongScores[currentPlayerIndex] === 0) {
              currentPower = 0; // 视为power 0，自动弃权
              // 标记玩家为OUT状态
              if (!this.gameState.outPlayers[currentPlayerIndex]) {
                this.gameState.outPlayers[currentPlayerIndex] = true;
                this.broadcast({
                  type: 'playerOut',
                  playerIndex: currentPlayerIndex
                });
              }
              console.log(`玩家${currentPlayerIndex}最后一张牌且无栋数，单张牌时power视为0，自动弃权`);
            }
          }
          
          // 使用调整后的power进行比较
          if (currentPower > winnerPower) {
            winnerPlay = validPlays[i];
            winnerPower = currentPower;
            console.log(`玩家${validPlays[i].playerIndex}的${currentCombo.name}(power=${currentPower})打败了当前赢家的${winnerCombo.name}(power=${winnerPower})`);
          }
        }
      }
      console.log(`最终赢家：玩家${winnerPlay.playerIndex}`);
    }

    // 检查至尊相关的积分处理（保留旧逻辑用于特殊计分）
    const firstSpecial = this.checkSpecialCombination(firstPlay.cards);
    const firstIsWenZhiZun = firstPlay.cards.length === 2 && 
                              firstPlay.cards[0].name === '伶冧六' && 
                              firstPlay.cards[1].name === '伶冧六';

    // 母至尊先出，赢家收取所有其他玩家的积分
    if (firstSpecial.type === 'muZhiZun') {
      const zhiZunPlayer = firstPlay.playerIndex;
      let totalCollected = 0;
      
      for (let i = 0; i < 4; i++) {
        if (i !== zhiZunPlayer) {
          const score = this.gameState.dongScores[i]; // 以栋数作为积分
          this.gameState.scores[zhiZunPlayer] += score;
          totalCollected += score;
        }
      }

      const zhiZunPlayerObj = this.players[zhiZunPlayer];
      zhiZunInfo = {
        type: 'muZhiZun',
        player: zhiZunPlayer,
        playerName: zhiZunPlayerObj ? zhiZunPlayerObj.playerName : `玩家${zhiZunPlayer}`,
        collected: totalCollected
      };
    }
    // 文至尊先出
    else if (firstIsWenZhiZun) {
      const wenZhiZunPlayer = firstPlay.playerIndex;
      
      // 检查是否有人用高脚七打败了文至尊
      let gaoJiaoQiPlayer = -1;
      for (const play of activePlays) {
        if (play.playerIndex !== wenZhiZunPlayer && 
            play.cards.length === 2 && 
            play.cards[0].name === '高脚七' && 
            play.cards[1].name === '高脚七') {
          gaoJiaoQiPlayer = play.playerIndex;
          break;
        }
      }

      if (gaoJiaoQiPlayer !== -1) {
        // 高脚七打败文至尊，文至尊玩家支付积分
        const penalty = this.gameState.dongScores[wenZhiZunPlayer];
        this.gameState.scores[gaoJiaoQiPlayer] += penalty;
        this.gameState.scores[wenZhiZunPlayer] -= penalty;

        const wenZhiZunPlayerObj = this.players[wenZhiZunPlayer];
        const gaoJiaoQiPlayerObj = this.players[gaoJiaoQiPlayer];
        zhiZunInfo = {
          type: 'wenZhiZunBeaten',
          wenZhiZunPlayer,
          wenZhiZunPlayerName: wenZhiZunPlayerObj ? wenZhiZunPlayerObj.playerName : `玩家${wenZhiZunPlayer}`,
          gaoJiaoQiPlayer,
          gaoJiaoQiPlayerName: gaoJiaoQiPlayerObj ? gaoJiaoQiPlayerObj.playerName : `玩家${gaoJiaoQiPlayer}`,
          penalty
        };
      } else {
        // 文至尊赢了，收取其他玩家积分
        let totalCollected = 0;
        for (let i = 0; i < 4; i++) {
          if (i !== wenZhiZunPlayer) {
            const score = this.gameState.dongScores[i];
            this.gameState.scores[wenZhiZunPlayer] += score;
            totalCollected += score;
          }
        }

        const wenZhiZunPlayerObj = this.players[wenZhiZunPlayer];
        zhiZunInfo = {
          type: 'wenZhiZun',
          player: wenZhiZunPlayer,
          playerName: wenZhiZunPlayerObj ? wenZhiZunPlayerObj.playerName : `玩家${wenZhiZunPlayer}`,
          collected: totalCollected
        };
      }
    }

    this.gameState.lastWinner = winnerPlay.playerIndex;
    this.gameState.currentRound++;
    
    // 累计栋数：栋数等于出的牌的数量
    const dongValue = winnerPlay.cards.length;
    this.gameState.dongScores[winnerPlay.playerIndex] += dongValue;

    // 获取赢家名称，处理玩家可能已断开的情况
    const winnerPlayer = this.players[winnerPlay.playerIndex];
    const winnerName = winnerPlayer ? winnerPlayer.playerName : `玩家${winnerPlay.playerIndex}`;

    this.broadcast({
      type: 'dongFinished',
      winner: winnerPlay.playerIndex,
      winnerName: winnerName,
      round: this.gameState.currentRound,
      dongValue: dongValue, // 本栋的价值（出了几张牌）
      dongScores: this.gameState.dongScores,
      scores: this.gameState.scores,
      zhiZunInfo
    });

    // 判断游戏是否结束
    // 条件：所有未被OUT的玩家手牌都打完了
    const allActivePlayersEmpty = this.gameState.hands.every((hand, index) => {
      // OUT的玩家忽略（他们保留最后一张牌）
      if (this.gameState.outPlayers[index]) {
        return true;
      }
      // 未OUT的玩家必须手牌为空
      return hand.length === 0;
    });
    
    if (allActivePlayersEmpty) {
      this.gameState.gameOver = true;
      // 找出积分最高的玩家
      let maxScore = Math.max(...this.gameState.scores);
      let finalWinner = this.gameState.scores.indexOf(maxScore);
      
      this.gameState.winner = finalWinner;
      
      // 赢家成为下一局的庄家
      this.gameState.dealerPosition = finalWinner;

      const finalWinnerObj = this.players[finalWinner];
      setTimeout(() => {
        this.broadcast({
          type: 'gameOver',
          winner: finalWinner,
          winnerName: finalWinnerObj ? finalWinnerObj.playerName : `玩家${finalWinner}`,
          finalScores: this.gameState.scores,
          dongScores: this.gameState.dongScores
        });
      }, 3000);
    } else {
      // 栋结束但游戏未结束，赢家成为新的首家出牌
      this.gameState.currentDong = [];
      this.gameState.dongFirstPlayer = winnerPlay.playerIndex;
      this.gameState.currentPlayer = winnerPlay.playerIndex;

      // 在新栋开始前，检查所有玩家是否应该被OUT
      // 条件：只剩1张牌 且 0栋
      for (let i = 0; i < 4; i++) {
        if (this.gameState.hands[i].length === 1 && 
            this.gameState.dongScores[i] === 0 &&
            !this.gameState.outPlayers[i]) {
          // 标记玩家为OUT
          this.gameState.outPlayers[i] = true;
          console.log(`玩家${i}只剩1张牌且0栋，标记为OUT`);
          // 立即广播OUT状态
          this.broadcast({
            type: 'playerOut',
            playerIndex: i
          });
        }
      }

      setTimeout(() => {
        this.broadcast({
          type: 'newDong',
          currentPlayer: this.gameState.currentPlayer,
          dealerPosition: this.gameState.dealerPosition
        });
        
        // 如果是机器人，自动出牌
        this.botAutoPlay();
      }, 3000);
    }
  }

  compareCards(cards1, cards2) {
    // 使用组合映射表获取牌型信息
    const combo1 = this.findCombination(cards1);
    const combo2 = this.findCombination(cards2);

    if (!combo1 || !combo2) {
      console.error('比较牌时发现无效组合');
      return 0;
    }

    // 至尊特殊规则：只有先出时才无敌
    // 在determineDongWinner中，第一个出牌的组合被视为先出
    // 但这里是两两比较，我们直接比较power值即可
    // 至尊和文至尊的特殊规则已在validateFollowPlay中处理

    // 直接比较power值
    // power越大越强
    if (combo1.power > combo2.power) return 1;
    if (combo1.power < combo2.power) return -1;
    
    // power相等，先出为大（在determineDongWinner中第一个就是先出的）
    return 0;
  }
}

// WebSocket连接处理
wss.on('connection', (ws) => {
  console.log('新客户端连接');
  let currentRoom = null;
  let currentPlayerId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('收到消息:', data);

      switch (data.type) {
        case 'joinRoom':
          handleJoinRoom(ws, data);
          break;
        case 'ready':
          handleReady(data);
          break;
        case 'rollDice':
          handleRollDice(data);
          break;
        case 'playCards':
          handlePlayCards(data);
          break;
        case 'pass':
          handlePass(data);
          break;
      }
    } catch (error) {
      console.error('处理消息错误:', error);
    }
  });

  ws.on('close', () => {
    console.log('客户端断开连接');
    if (currentRoom && currentPlayerId) {
      const room = rooms.get(currentRoom);
      if (room) {
        const isEmpty = room.removePlayer(currentPlayerId);
        if (isEmpty) {
          rooms.delete(currentRoom);
        } else {
          room.broadcast({
            type: 'playerLeft',
            playerId: currentPlayerId,
            playerCount: room.players.length
          });
        }
      }
    }
  });

  function handleJoinRoom(ws, data) {
    const { roomId, playerId, playerName, position } = data;
    currentRoom = roomId;
    currentPlayerId = playerId;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new GameRoom(roomId));
      // 新房间：初始化4个空座位，用机器人占位
      const room = rooms.get(roomId);
      const botNames = ['机器人A', '机器人B', '机器人C', '机器人D'];
      for (let i = 0; i < 4; i++) {
        const botId = `bot_${roomId}_${i}`;
        room.addPlayer(null, botId, botNames[i], true);
      }
    }

    const room = rooms.get(roomId);
    
    // 如果指定了座位，尝试占据该座位
    if (position !== undefined && position >= 0 && position < 4) {
      const targetPlayer = room.players[position];
      
      // 检查座位是否可用（必须是机器人）
      if (!targetPlayer.isBot || targetPlayer.playerId.startsWith('human_')) {
        ws.send(JSON.stringify({
          type: 'seatTaken',
          message: '该座位已被占据'
        }));
        return;
      }
      
      // 替换机器人为真人玩家
      room.players[position] = {
        ws,
        playerId,
        playerName,
        ready: false,
        isBot: false
      };
      
      // 确保剩余机器人都是准备状态
      room.players.forEach(p => {
        if (p.isBot && !p.playerId.startsWith('human_')) {
          p.ready = true;
        }
      });
      
      ws.send(JSON.stringify({
        type: 'joinSuccess',
        roomId,
        playerId,
        position: position,
        playerCount: room.players.filter(p => !p.isBot || p.playerId.startsWith('human_')).length,
        seats: room.players.map(p => ({
          name: p.playerName,
          isBot: p.isBot && !p.playerId.startsWith('human_'),
          ready: p.ready
        }))
      }));
      
      // 广播座位更新
      room.broadcast({
        type: 'seatUpdate',
        seats: room.players.map(p => ({
          name: p.playerName,
          isBot: p.isBot && !p.playerId.startsWith('human_'),
          ready: p.ready
        }))
      });
      
    } else {
      // 没有指定座位，返回当前座位状态
      ws.send(JSON.stringify({
        type: 'showSeats',
        roomId,
        seats: room.players.map(p => ({
          name: p.playerName,
          isBot: p.isBot && !p.playerId.startsWith('human_'),
          ready: p.ready
        }))
      }));
    }
  }

  function handleReady(data) {
    const room = rooms.get(currentRoom);
    if (!room) return;

    const player = room.players.find(p => p.playerId === currentPlayerId);
    if (player) {
      player.ready = true;
      
      room.broadcast({
        type: 'playerReady',
        playerId: currentPlayerId,
        players: room.players.map(p => ({ name: p.playerName, ready: p.ready }))
      });

      // 检查是否所有玩家都准备好了
      if (room.players.length === 4 && room.players.every(p => p.ready)) {
        setTimeout(() => {
          room.startGame();
        }, 1000);
      }
    }
  }

  function handleRollDice(data) {
    const room = rooms.get(currentRoom);
    if (!room) return;
    
    room.handleDiceRoll(currentPlayerId);
  }

  function handlePlayCards(data) {
    const room = rooms.get(currentRoom);
    if (!room) return;

    const { cards } = data;
    const playerIndex = room.players.findIndex(p => p.playerId === currentPlayerId);

    console.log(`玩家${playerIndex}尝试出牌：`, cards.map(c => `${c.id}(${c.name})`).join('+'));

    if (playerIndex !== room.gameState.currentPlayer) {
      room.sendToPlayer(currentPlayerId, {
        type: 'error',
        message: '还没轮到您出牌'
      });
      return;
    }

    // 检查玩家是否被OUT
    if (room.gameState.outPlayers[playerIndex]) {
      room.sendToPlayer(currentPlayerId, {
        type: 'error',
        message: '您已被OUT，无法继续出牌'
      });
      return;
    }

    // 验证出牌是否合法
    const validation = room.validatePlay(cards, playerIndex);
    console.log(`出牌验证结果：`, validation);
    
    if (!validation.valid) {
      console.log(`出牌被拒绝：${validation.error}`);
      room.sendToPlayer(currentPlayerId, {
        type: 'error',
        message: validation.error
      });
      return;
    }

    // 从手牌中移除打出的牌
    cards.forEach(card => {
      const index = room.gameState.hands[playerIndex].findIndex(c => c.id === card.id);
      if (index !== -1) {
        room.gameState.hands[playerIndex].splice(index, 1);
      }
    });

    // 添加到当前栋
    room.gameState.currentDong.push({
      playerId: currentPlayerId,
      playerIndex,
      cards
    });

    room.broadcast({
      type: 'cardsPlayed',
      playerId: currentPlayerId,
      playerIndex,
      cards,
      currentDong: room.gameState.currentDong,
      handCounts: room.gameState.hands.map(h => h.length)
    });

    // 使用新的checkDongEnd方法
    room.checkDongEnd();
  }

  function handlePass(data) {
    const room = rooms.get(currentRoom);
    if (!room) return;

    const playerIndex = room.players.findIndex(p => p.playerId === currentPlayerId);

    if (playerIndex !== room.gameState.currentPlayer) {
      return;
    }

    // 如果玩家被OUT，不需要丢牌，直接过牌
    if (room.gameState.outPlayers[playerIndex]) {
      room.gameState.currentDong.push({
        playerId: currentPlayerId,
        playerIndex,
        cards: [],
        passed: true
      });

      room.broadcast({
        type: 'playerPassed',
        playerId: currentPlayerId,
        playerIndex,
        discardedCards: [],
        handCounts: room.gameState.hands.map(h => h.length)
      });

      room.checkDongEnd();
      return;
    }

    // 过牌时必须丢弃与首家相同数量的牌
    const discardedCards = data.cards || [];
    const firstPlay = room.gameState.currentDong.find(play => !play.passed);
    
    if (firstPlay && discardedCards.length !== firstPlay.cards.length) {
      // 丢弃的牌数必须与首家出的牌数相同
      ws.send(JSON.stringify({
        type: 'error',
        message: `过牌时必须丢弃${firstPlay.cards.length}张牌`
      }));
      return;
    }

    // 从手牌中移除丢弃的牌
    const hand = room.gameState.hands[playerIndex];
    discardedCards.forEach(card => {
      const index = hand.findIndex(c => c.id === card.id);
      if (index !== -1) {
        hand.splice(index, 1);
      }
    });

    // 添加过牌记录
    room.gameState.currentDong.push({
      playerId: currentPlayerId,
      playerIndex,
      cards: discardedCards,
      passed: true
    });

    room.broadcast({
      type: 'playerPassed',
      playerId: currentPlayerId,
      playerIndex,
      discardedCards,
      handCounts: room.gameState.hands.map(h => h.length)
    });

    // 使用新的checkDongEnd方法
    room.checkDongEnd();
  }

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`天九至尊服务器运行在 http://localhost:${PORT}`);
  console.log(`请在浏览器中打开 http://localhost:${PORT} 开始游戏`);
});
