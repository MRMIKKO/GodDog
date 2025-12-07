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
      waitingForDice: false // 是否等待摇骰
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
    this.gameState.deck = [
      // 文牌（22张，11种，每种2张）
      { id: 'tian1', name: '天', type: 'wen', rank: 1, points: 12, image: '天.svg' },
      { id: 'tian2', name: '天', type: 'wen', rank: 1, points: 12, image: '天.svg' },
      { id: 'di1', name: '地', type: 'wen', rank: 2, points: 2, image: '地.svg' },
      { id: 'di2', name: '地', type: 'wen', rank: 2, points: 2, image: '地.svg' },
      { id: 'ren1', name: '人', type: 'wen', rank: 3, points: 8, image: '人.svg' },
      { id: 'ren2', name: '人', type: 'wen', rank: 3, points: 8, image: '人.svg' },
      { id: 'e1', name: '饿', type: 'wen', rank: 4, points: 4, image: '饿.svg' },
      { id: 'e2', name: '饿', type: 'wen', rank: 4, points: 4, image: '饿.svg' },
      { id: 'mei1', name: '梅', type: 'wen', rank: 5, points: 10, image: '梅.svg' },
      { id: 'mei2', name: '梅', type: 'wen', rank: 5, points: 10, image: '梅.svg' },
      { id: 'changshan1', name: '长山', type: 'wen', rank: 6, points: 6, image: '长山.svg' },
      { id: 'changshan2', name: '长山', type: 'wen', rank: 6, points: 6, image: '长山.svg' },
      { id: 'bandeng1', name: '板凳', type: 'wen', rank: 7, points: 4, image: '板凳.svg' },
      { id: 'bandeng2', name: '板凳', type: 'wen', rank: 7, points: 4, image: '板凳.svg' },
      { id: 'futou1', name: '斧头', type: 'wen', rank: 8, points: 11, image: '斧头.svg' },
      { id: 'futou2', name: '斧头', type: 'wen', rank: 8, points: 11, image: '斧头.svg' },
      { id: 'pingfeng1', name: '平峰', type: 'wen', rank: 9, points: 10, image: '平峰.svg' },
      { id: 'pingfeng2', name: '平峰', type: 'wen', rank: 9, points: 10, image: '平峰.svg' },
      { id: 'gaojiao1', name: '高脚七', type: 'wen', rank: 10, points: 7, image: '高脚七.svg' },
      { id: 'gaojiao2', name: '高脚七', type: 'wen', rank: 10, points: 7, image: '高脚七.svg' },
      { id: 'bishiliu1', name: '鼻屎六', type: 'wen', rank: 11, points: 6, image: '鼻屎六.svg' },
      { id: 'bishiliu2', name: '鼻屎六', type: 'wen', rank: 11, points: 6, image: '鼻屎六.svg' },
      
      // 武牌（10张，10种，每种1张）
      { id: 'jiudianA', name: '九点A', type: 'wu', rank: 12, points: 9, image: '九点A.svg' },
      { id: 'jiudianB', name: '九点B', type: 'wu', rank: 13, points: 9, image: '九点B.svg' },
      { id: 'badianA', name: '八点A', type: 'wu', rank: 14, points: 8, image: '八点A.svg' },
      { id: 'badianB', name: '八点B', type: 'wu', rank: 15, points: 8, image: '八点B.svg' },
      { id: 'qidianA', name: '七点A', type: 'wu', rank: 16, points: 7, image: '七点A.svg' },
      { id: 'qidianB', name: '七点B', type: 'wu', rank: 17, points: 7, image: '七点B.svg' },
      { id: 'wudianA', name: '五点A', type: 'wu', rank: 18, points: 5, image: '五点A.svg' },
      { id: 'wudianB', name: '五点B', type: 'wu', rank: 19, points: 5, image: '五点B.svg' },
      { id: 'sandian', name: '三点', type: 'wu', rank: 20, points: 3, image: '三点.svg' },
      { id: 'liudian', name: '六点', type: 'wu', rank: 21, points: 6, image: '六点.svg' }
    ];

    // 洗牌
    this.shuffle(this.gameState.deck);
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
    if (cards.length === 1) {
      // 单张，任何牌都可以
      return { valid: true };
    } else if (cards.length === 2) {
      // 检查特殊组合（母至尊）
      const special = this.checkSpecialCombination(cards);
      if (special.isSpecial) {
        return { valid: true, isSpecial: true, specialType: special.type };
      }

      // 检查文牌对子
      if (cards[0].type === 'wen' && cards[1].type === 'wen' && cards[0].rank === cards[1].rank) {
        // 检查是否是文至尊（双鼻屎六）
        if (cards[0].rank === 11) {
          return { valid: true, isPair: true, isWenZhiZun: true };
        }
        return { valid: true, isPair: true };
      }

      // 检查武牌对子
      if (cards[0].type === 'wu' && cards[1].type === 'wu') {
        const ranks = [cards[0].rank, cards[1].rank].sort((a, b) => b - a);
        const validWuPairs = [
          [9, 6], // 至尊
          [9, 5], // 饿五
          [9, 8], // 杂九
          [8, 7], // 杂八
          [7, 6], // 杂七
          [5, 3]  // 杂五
        ];

        for (const validPair of validWuPairs) {
          if (ranks[0] === validPair[0] && ranks[1] === validPair[1]) {
            return { valid: true, isPair: true, isWuPair: true };
          }
        }
      }

      return { valid: false, error: '两张牌必须是文牌对子、武牌对子或特殊组合' };
    } else {
      return { valid: false, error: '一次只能出1张或2张牌（对子或特殊组合）' };
    }
  }

  // 检查特殊组合
  checkSpecialCombination(cards) {
    if (cards.length !== 2) {
      return { isSpecial: false };
    }

    const names = cards.map(c => c.name).sort();
    const ids = cards.map(c => c.id).sort();

    // 母至尊：三点 + 六点
    if ((names.includes('三点') && names.includes('六点')) ||
        (cards[0].name === '三点' && cards[1].name === '六点') ||
        (cards[0].name === '六点' && cards[1].name === '三点')) {
      return { isSpecial: true, type: 'muZhiZun', name: '母至尊' };
    }

    // 文至尊已经在validateFirstPlay中处理（双鼻屎六）

    return { isSpecial: false };
  }

  validateFollowPlay(cards) {
    const activePlays = this.gameState.currentDong.filter(d => d.cards && d.cards.length > 0);
    if (activePlays.length === 0) {
      return { valid: false, error: '没有需要跟的牌' };
    }

    const lastPlay = activePlays[activePlays.length - 1];
    const requiredCount = lastPlay.cards.length;

    // 牌数必须相同
    if (cards.length !== requiredCount) {
      return { valid: false, error: `需要出${requiredCount}张牌` };
    }

    // 检查当前牌的特殊组合
    const currentSpecial = this.checkSpecialCombination(cards);
    
    // 如果是对子或特殊组合
    if (requiredCount === 2) {
      // 检查上家是否是母至尊
      const lastSpecial = this.checkSpecialCombination(lastPlay.cards);
      if (lastSpecial.type === 'muZhiZun') {
        return { valid: false, error: '母至尊无敌，无法打败' };
      }

      // 检查上家是否是文至尊（双鼻屎六）
      const lastIsWenZhiZun = lastPlay.cards[0].rank === 11 && 
                              lastPlay.cards[1].rank === 11 && 
                              lastPlay.cards[0].type === 'wen';

      if (lastIsWenZhiZun) {
        // 只有高脚七对子能打文至尊
        const isGaoJiaoQi = cards[0].rank === 10 && 
                            cards[1].rank === 10 && 
                            cards[0].type === 'wen';
        
        if (isGaoJiaoQi) {
          return { valid: true, isPair: true, beatsWenZhiZun: true };
        } else {
          return { valid: false, error: '文至尊只有高脚七对子能打' };
        }
      }

      // 检查当前是否是文至尊
      const currentIsWenZhiZun = cards[0].rank === 11 && 
                                  cards[1].rank === 11 && 
                                  cards[0].type === 'wen';
      
      if (currentIsWenZhiZun) {
        // 文至尊可以打任何普通对子（但打不过母至尊，已经检查过了）
        return { valid: true, isPair: true, isWenZhiZun: true };
      }

      // 检查当前是否是母至尊
      if (currentSpecial.type === 'muZhiZun') {
        // 母至尊可以打任何牌
        return { valid: true, isSpecial: true, specialType: 'muZhiZun' };
      }

      // 普通对子逻辑
      const lastIsPair = lastPlay.cards[0].rank === lastPlay.cards[1].rank;
      const currentIsPair = cards[0].rank === cards[1].rank;

      if (!lastIsPair && !lastSpecial.isSpecial) {
        return { valid: false, error: '上家不是对子' };
      }

      if (!currentIsPair || cards[0].type !== 'wen') {
        return { valid: false, error: '必须出文牌对子或特殊组合' };
      }

      // 检查是否比上家大
      if (cards[0].rank >= lastPlay.cards[0].rank) {
        return { valid: false, error: '您的对子不够大（rank数值越小越大）' };
      }

      return { valid: true, isPair: true };
    }

    // 单张，检查是否比上家大
    if (cards[0].rank >= lastPlay.cards[0].rank) {
      return { valid: false, error: '您的牌不够大' };
    }

    return { valid: true };
  }

  // 机器人自动出牌
  botAutoPlay() {
    const currentPlayer = this.players[this.gameState.currentPlayer];
    if (!currentPlayer || !currentPlayer.isBot) {
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
    // 查找对子
    const pairs = this.findPairs(hand);
    
    if (pairs.length > 0) {
      // 出最小的对子
      const largestPair = pairs[pairs.length - 1];
      return largestPair;
    }
    
    // 没有对子，出最小的单张
    const sorted = [...hand].sort((a, b) => b.rank - a.rank);
    return [sorted[sorted.length - 1]];
  }

  getBotFollowPlay(hand) {
    const activePlays = this.gameState.currentDong.filter(d => d.cards && d.cards.length > 0);
    if (activePlays.length === 0) return [];

    const lastPlay = activePlays[activePlays.length - 1];
    const requiredCount = lastPlay.cards.length;

    // 如果需要出对子
    if (requiredCount === 2 && lastPlay.cards[0].rank === lastPlay.cards[1].rank) {
      const pairs = this.findPairs(hand);
      const biggerPairs = pairs.filter(pair => pair[0].rank < lastPlay.cards[0].rank);
      
      // 30%概率不出大牌
      if (biggerPairs.length > 0 && Math.random() > 0.3) {
        return biggerPairs[0]; // 出最小的能压过的对子
      }
    } else if (requiredCount === 1) {
      // 单张
      const biggerCards = hand.filter(c => c.rank < lastPlay.cards[0].rank);
      
      // 40%概率不出大牌
      if (biggerCards.length > 0 && Math.random() > 0.4) {
        const sorted = biggerCards.sort((a, b) => b.rank - a.rank);
        return [sorted[0]]; // 出最小的能压过的牌
      }
    }

    return []; // 过牌
  }

  findPairs(hand) {
    const pairs = [];
    const counted = new Set();

    // 文牌对子：相同rank的两张文牌
    for (let i = 0; i < hand.length; i++) {
      if (counted.has(hand[i].id)) continue;
      
      for (let j = i + 1; j < hand.length; j++) {
        if (counted.has(hand[j].id)) continue;
        
        if (hand[i].rank === hand[j].rank && hand[i].type === 'wen') {
          pairs.push([hand[i], hand[j]]);
          counted.add(hand[i].id);
          counted.add(hand[j].id);
          break;
        }
      }
    }

    // 武牌对子：特定的两张武牌组合
    // 杂牌组合规则（根据天九牌规则）
    const wuPairs = [
      // 至尊对：九点+六点 (rank 9 + rank 6)
      { ranks: [9, 6], name: '至尊' },
      // 饿五：斧头+五点 (rank 9 + rank 5)
      { ranks: [9, 5], name: '饿五' },
      // 杂九：九点+八点 (rank 9 + rank 8)
      { ranks: [9, 8], name: '杂九' },
      // 杂八：八点+七点 (rank 8 + rank 7)
      { ranks: [8, 7], name: '杂八' },
      // 杂七：七点+六点 (rank 7 + rank 6)
      { ranks: [7, 6], name: '杂七' },
      // 杂五：五点+三点 (rank 5 + rank 3)
      { ranks: [5, 3], name: '杂五' }
    ];

    for (const pair of wuPairs) {
      for (let i = 0; i < hand.length; i++) {
        if (counted.has(hand[i].id)) continue;
        if (hand[i].type !== 'wu') continue;
        
        for (let j = i + 1; j < hand.length; j++) {
          if (counted.has(hand[j].id)) continue;
          if (hand[j].type !== 'wu') continue;
          
          const ranks = [hand[i].rank, hand[j].rank].sort((a, b) => b - a);
          const pairRanks = [...pair.ranks].sort((a, b) => b - a);
          
          if (ranks[0] === pairRanks[0] && ranks[1] === pairRanks[1]) {
            pairs.push([hand[i], hand[j]]);
            counted.add(hand[i].id);
            counted.add(hand[j].id);
            break;
          }
        }
      }
    }

    // 按rank排序（武牌对子用两张牌的最大rank）
    return pairs.sort((a, b) => {
      const maxA = Math.max(a[0].rank, a[1].rank);
      const maxB = Math.max(b[0].rank, b[1].rank);
      return maxA - maxB;
    });
  }

  processBotPlay(playerIndex, cards) {
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
      currentDong: this.gameState.currentDong
    });

    // 检查是否该结束这一栋
    this.checkDongEnd();
  }

  processBotPass(playerIndex) {
    const playerId = this.players[playerIndex].playerId;
    const hand = this.gameState.hands[playerIndex];

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
      discardedCards
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

    let winnerPlay = activePlays[0];
    let zhiZunInfo = null;

    for (let i = 1; i < activePlays.length; i++) {
      if (this.compareCards(activePlays[i].cards, winnerPlay.cards) > 0) {
        winnerPlay = activePlays[i];
      }
    }

    // 检查至尊相关的积分处理
    const firstPlay = activePlays[0];
    const firstSpecial = this.checkSpecialCombination(firstPlay.cards);
    const firstIsWenZhiZun = firstPlay.cards.length === 2 && 
                              firstPlay.cards[0].rank === 11 && 
                              firstPlay.cards[1].rank === 11;

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

      zhiZunInfo = {
        type: 'muZhiZun',
        player: zhiZunPlayer,
        playerName: this.players[zhiZunPlayer].playerName,
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
            play.cards[0].rank === 10 && 
            play.cards[1].rank === 10) {
          gaoJiaoQiPlayer = play.playerIndex;
          break;
        }
      }

      if (gaoJiaoQiPlayer !== -1) {
        // 高脚七打败文至尊，文至尊玩家支付积分
        const penalty = this.gameState.dongScores[wenZhiZunPlayer];
        this.gameState.scores[gaoJiaoQiPlayer] += penalty;
        this.gameState.scores[wenZhiZunPlayer] -= penalty;

        zhiZunInfo = {
          type: 'wenZhiZunBeaten',
          wenZhiZunPlayer,
          wenZhiZunPlayerName: this.players[wenZhiZunPlayer].playerName,
          gaoJiaoQiPlayer,
          gaoJiaoQiPlayerName: this.players[gaoJiaoQiPlayer].playerName,
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

        zhiZunInfo = {
          type: 'wenZhiZun',
          player: wenZhiZunPlayer,
          playerName: this.players[wenZhiZunPlayer].playerName,
          collected: totalCollected
        };
      }
    }

    this.gameState.lastWinner = winnerPlay.playerIndex;
    this.gameState.currentRound++;
    
    // 累计栋数：栋数等于出的牌的数量
    const dongValue = winnerPlay.cards.length;
    this.gameState.dongScores[winnerPlay.playerIndex] += dongValue;

    this.broadcast({
      type: 'dongFinished',
      winner: winnerPlay.playerIndex,
      winnerName: this.players[winnerPlay.playerIndex].playerName,
      round: this.gameState.currentRound,
      dongValue: dongValue, // 本栋的价值（出了几张牌）
      dongScores: this.gameState.dongScores,
      scores: this.gameState.scores,
      zhiZunInfo
    });

    const allHandsEmpty = this.gameState.hands.every(hand => hand.length === 0);
    
    if (allHandsEmpty) {
      this.gameState.gameOver = true;
      // 找出积分最高的玩家
      let maxScore = Math.max(...this.gameState.scores);
      let finalWinner = this.gameState.scores.indexOf(maxScore);
      
      this.gameState.winner = finalWinner;
      
      // 赢家成为下一局的庄家
      this.gameState.dealerPosition = finalWinner;

      setTimeout(() => {
        this.broadcast({
          type: 'gameOver',
          winner: finalWinner,
          winnerName: this.players[finalWinner].playerName,
          finalScores: this.gameState.scores,
          dongScores: this.gameState.dongScores
        });
      }, 3000);
    } else {
      // 栋结束但游戏未结束，赢家成为新的首家出牌
      this.gameState.currentDong = [];
      this.gameState.dongFirstPlayer = winnerPlay.playerIndex;
      this.gameState.currentPlayer = winnerPlay.playerIndex;

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
    // 检查特殊组合
    const special1 = this.checkSpecialCombination(cards1);
    const special2 = this.checkSpecialCombination(cards2);

    // 母至尊最大
    if (special1.type === 'muZhiZun') return 1;
    if (special2.type === 'muZhiZun') return -1;

    // 检查文至尊
    const isWenZhiZun1 = cards1.length === 2 && cards1[0].rank === 11 && cards1[1].rank === 11 && cards1[0].type === 'wen';
    const isWenZhiZun2 = cards2.length === 2 && cards2[0].rank === 11 && cards2[1].rank === 11 && cards2[0].type === 'wen';

    // 检查高脚七对子
    const isGaoJiaoQi1 = cards1.length === 2 && cards1[0].rank === 10 && cards1[1].rank === 10 && cards1[0].type === 'wen';
    const isGaoJiaoQi2 = cards2.length === 2 && cards2[0].rank === 10 && cards2[1].rank === 10 && cards2[0].type === 'wen';

    // 高脚七 vs 文至尊的特殊规则
    if (isGaoJiaoQi1 && isWenZhiZun2) return 1;  // 高脚七打败文至尊
    if (isWenZhiZun1 && isGaoJiaoQi2) return -1; // 文至尊输给高脚七

    // 文至尊大于所有普通对子
    if (isWenZhiZun1 && !isWenZhiZun2 && !isGaoJiaoQi2) return 1;
    if (isWenZhiZun2 && !isWenZhiZun1 && !isGaoJiaoQi1) return -1;

    // 普通对子比较
    const isPair1 = cards1.length === 2 && cards1[0].rank === cards1[1].rank;
    const isPair2 = cards2.length === 2 && cards2[0].rank === cards2[1].rank;

    if (isPair1 && !isPair2) return 1;
    if (!isPair1 && isPair2) return -1;

    if (isPair1 && isPair2) {
      return cards2[0].rank - cards1[0].rank;
    }

    // 单张比较
    const rank1 = Math.min(...cards1.map(c => c.rank));
    const rank2 = Math.min(...cards2.map(c => c.rank));
    
    return rank2 - rank1;
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

    if (playerIndex !== room.gameState.currentPlayer) {
      room.sendToPlayer(currentPlayerId, {
        type: 'error',
        message: '还没轮到您出牌'
      });
      return;
    }

    // 验证出牌是否合法
    const validation = room.validatePlay(cards, playerIndex);
    if (!validation.valid) {
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
      currentDong: room.gameState.currentDong
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
      discardedCards
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
