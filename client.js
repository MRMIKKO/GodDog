// 游戏客户端逻辑
class TianJiuGame {
    constructor() {
        this.ws = null;
        this.playerId = this.generatePlayerId();
        this.playerName = '';
        this.roomId = '';
        this.position = -1;
        this.hand = [];
        this.selectedCards = [];
        this.awaitingPlayConfirmation = false;
        this.currentPlayer = 0;
        this.players = [];
        this.currentDong = []; // 追踪当前栋的出牌情况
        this.dealerPosition = -1; // 庄家位置
        this.firstHandDealer = -1; // 第一局的庄家（头出二庄的"二庄"）
        
        this.initializeUI();
        this.setupEventListeners();
    }

    generatePlayerId() {
        return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    initializeUI() {
        // 获取所有界面元素
        this.screens = {
            login: document.getElementById('loginScreen'),
            seatSelection: document.getElementById('seatSelectionScreen'),
            waiting: document.getElementById('waitingScreen'),
            game: document.getElementById('gameScreen'),
            gameOver: document.getElementById('gameOverScreen')
        };

        this.elements = {
            playerNameInput: document.getElementById('playerName'),
            roomIdInput: document.getElementById('roomId'),
            joinBtn: document.getElementById('joinBtn'),
            readyBtn: document.getElementById('readyBtn'),
            playBtn: document.getElementById('playBtn'),
            passBtn: document.getElementById('passBtn'),
            sortBtn: document.getElementById('sortBtn'),
            playerCards: document.getElementById('playerCards'),
            playedCards: document.getElementById('playedCards'),
            toast: document.getElementById('toast'),
            displayRoomId: document.getElementById('displayRoomId'),
            seatRoomId: document.getElementById('seatRoomId'),
            currentRound: document.getElementById('currentRound'),
            turnText: document.getElementById('turnText'),
            winnerName: document.getElementById('winnerName'),
            playAgainBtn: document.getElementById('playAgainBtn'),
            backToLobbyBtn: document.getElementById('backToLobbyBtn'),
            dongScoresDisplay: document.getElementById('dongScoresDisplay'),
            pos0PlayerName: document.getElementById('pos0PlayerName'),
            pos1PlayerName: document.getElementById('pos1PlayerName'),
            pos2PlayerName: document.getElementById('pos2PlayerName'),
            pos3PlayerName: document.getElementById('pos3PlayerName'),
            pos0CardsCount: document.getElementById('pos0CardsCount'),
            pos1CardsCount: document.getElementById('pos1CardsCount'),
            pos2CardsCount: document.getElementById('pos2CardsCount'),
            pos3CardsCount: document.getElementById('pos3CardsCount'),
            pos0DongCount: document.getElementById('pos0DongCount'),
            pos1DongCount: document.getElementById('pos1DongCount'),
            pos2DongCount: document.getElementById('pos2DongCount'),
            pos3DongCount: document.getElementById('pos3DongCount'),
            pos0DealerBadge: document.getElementById('pos0DealerBadge'),
            pos1DealerBadge: document.getElementById('pos1DealerBadge'),
            pos2DealerBadge: document.getElementById('pos2DealerBadge'),
            pos3DealerBadge: document.getElementById('pos3DealerBadge'),
            diceContainer: document.getElementById('diceContainer'),
            rollDiceBtn: document.getElementById('rollDiceBtn'),
            dice1: document.getElementById('dice1'),
            dice2: document.getElementById('dice2'),
            diceInfo: document.getElementById('diceInfo')
        };
    }

    setupEventListeners() {
        this.elements.joinBtn.addEventListener('click', () => this.joinRoom());
        this.elements.readyBtn.addEventListener('click', () => this.sendReady());
        this.elements.playBtn.addEventListener('click', () => this.playSelectedCards());
        this.elements.passBtn.addEventListener('click', () => this.pass());
        this.elements.sortBtn.addEventListener('click', () => this.sortHand());
        this.elements.playAgainBtn.addEventListener('click', () => this.playAgain());
        this.elements.backToLobbyBtn.addEventListener('click', () => this.backToLobby());
        this.elements.rollDiceBtn.addEventListener('click', () => this.rollDice());

        // 座位选择按钮
        document.querySelectorAll('.btn-select-seat').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const position = parseInt(e.target.dataset.position);
                this.selectSeat(position);
            });
        });

        // 回车键加入房间
        this.elements.playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        this.elements.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket连接成功');
            this.sendMessage({
                type: 'joinRoom',
                roomId: this.roomId,
                playerId: this.playerId,
                playerName: this.playerName
            });
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket错误:', error);
            this.showToast('连接错误，请刷新页面重试');
        };

        this.ws.onclose = () => {
            console.log('WebSocket连接关闭');
            this.showToast('连接已断开');
        };
    }

    sendMessage(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    handleMessage(data) {
        console.log('收到消息:', data);

        switch (data.type) {
            case 'showSeats':
                this.handleShowSeats(data);
                break;
            case 'seatUpdate':
                this.handleSeatUpdate(data);
                break;
            case 'seatTaken':
                this.showToast(data.message);
                break;
            case 'joinSuccess':
                this.handleJoinSuccess(data);
                break;
            case 'joinFailed':
                this.showToast(data.reason);
                break;
            case 'playerJoined':
                this.handlePlayerJoined(data);
                break;
            case 'playerLeft':
                this.handlePlayerLeft(data);
                break;
            case 'playerReady':
                this.handlePlayerReady(data);
                break;
            case 'gameStart':
                this.handleGameStart(data);
                break;
            case 'waitForDice':
                this.handleWaitForDice(data);
                break;
            case 'diceRolled':
                this.handleDiceRolled(data);
                break;
            case 'dealCards':
                this.handleDealCards(data);
                break;
            case 'turnChange':
                this.handleTurnChange(data);
                break;
            case 'cardsPlayed':
                this.handleCardsPlayed(data);
                break;
            case 'playerPassed':
                this.handlePlayerPassed(data);
                break;
            case 'dongFinished':
                this.handleDongFinished(data);
                break;
            case 'newDong':
                this.handleNewDong(data);
                break;
            case 'gameOver':
                this.handleGameOver(data);
                break;
            case 'error':
                // 如果有待确认的出牌，保持手牌和选中状态，提示错误并允许重新操作
                this.showToast(data.message, 3000);
                this.awaitingPlayConfirmation = false;
                this.updateControlButtons();
                break;
        }
    }

    joinRoom() {
        this.playerName = this.elements.playerNameInput.value.trim();
        this.roomId = this.elements.roomIdInput.value.trim() || 'room_' + Math.random().toString(36).substr(2, 6);

        if (!this.playerName) {
            return;
        }

        this.connectWebSocket();
    }

    handleShowSeats(data) {
        this.roomId = data.roomId;
        this.elements.seatRoomId.textContent = this.roomId;
        this.updateSeatsDisplay(data.seats);
        this.showScreen('seatSelection');
    }

    handleSeatUpdate(data) {
        this.updateSeatsDisplay(data.seats);
    }

    updateSeatsDisplay(seats) {
        seats.forEach((seat, index) => {
            const seatNameEl = document.getElementById(`seat${index}Name`);
            const seatBtn = document.querySelector(`.btn-select-seat[data-position="${index}"]`);
            const seatSlot = document.querySelector(`.seat-slot[data-position="${index}"]`);
            
            if (seat.isBot) {
                seatNameEl.textContent = '空位';
                seatBtn.disabled = false;
                seatSlot.classList.remove('occupied');
            } else {
                seatNameEl.textContent = seat.name;
                seatBtn.disabled = true;
                seatSlot.classList.add('occupied');
            }
        });
    }

    selectSeat(position) {
        this.sendMessage({
            type: 'joinRoom',
            roomId: this.roomId,
            playerId: this.playerId,
            playerName: this.playerName,
            position: position
        });
    }

    handleJoinSuccess(data) {
        this.roomId = data.roomId;
        this.position = data.position;
        
        // 保存玩家列表
        if (data.seats) {
            this.players = data.seats;
            this.updatePlayersList(data.seats);
        } else if (data.players) {
            this.players = data.players;
            this.updatePlayersList(data.players);
        }
        
        this.showScreen('waiting');
        this.elements.displayRoomId.textContent = this.roomId;

        // 启用准备按钮
        if (data.playerCount >= 1) {
            this.elements.readyBtn.disabled = false;
        }
    }

    handlePlayerJoined(data) {
        this.updatePlayersList(data.players);
        
        if (data.playerCount === 4) {
            this.elements.readyBtn.disabled = false;
        }
    }

    handlePlayerLeft(data) {
        // 玩家离开
    }

    handlePlayerReady(data) {
        this.updatePlayersList(data.players);
    }

    updatePlayersList(players) {
        this.players = players;
        players.forEach((player, index) => {
            const nameEl = document.getElementById(`player${index}Name`);
            const readyEl = document.getElementById(`player${index}Ready`);
            
            if (nameEl) {
                // 处理机器人占位
                if (player.isBot) {
                    nameEl.textContent = '机器人';
                } else {
                    nameEl.textContent = player.name || '等待中...';
                }
            }
            if (readyEl) {
                readyEl.textContent = player.ready ? '✓ 已准备' : '';
            }

            const slot = nameEl?.closest('.player-slot');
            if (slot) {
                if (player.name && !player.isBot) {
                    slot.classList.add('active');
                } else {
                    slot.classList.remove('active');
                }
            }
        });
    }

    sendReady() {
        this.sendMessage({ type: 'ready' });
        this.elements.readyBtn.disabled = true;
        this.elements.readyBtn.textContent = '已准备';
    }

    handleGameStart(data) {
        this.showScreen('game');
        
        // 确保有玩家数据（从gameState或之前保存的players）
        if (data.gameState && data.gameState.players) {
            this.players = data.gameState.players;
        }
        
        // 更新玩家名称显示
        this.updateGamePlayerNames();
        
        // 初始化所有玩家的牌数和栋数
        for (let i = 0; i < 4; i++) {
            const cardsCount = this.elements[`pos${i}CardsCount`];
            const dongCount = this.elements[`pos${i}DongCount`];
            if (cardsCount) cardsCount.textContent = '0张';
            if (dongCount) dongCount.textContent = '0栋';
        }
        
        // 不再自动发牌，等待骰子环节
    }

    handleWaitForDice(data) {
        // 显示骰子容器
        this.elements.diceContainer.classList.remove('hidden');
        this.dealerPosition = data.dealerPosition;
        this.firstHandDealer = data.firstHandDealer;
        
        // 计算摇骰者（庄家的对家）
        const diceRollerPosition = (this.dealerPosition + 2) % 4;
        
        // 如果是我需要摇骰
        if (diceRollerPosition === this.position) {
            this.elements.rollDiceBtn.disabled = false;
            this.elements.diceInfo.textContent = '请摇骰子决定谁先摸牌';
        } else {
            this.elements.rollDiceBtn.disabled = true;
            const rollerName = this.players[diceRollerPosition]?.name || `玩家${diceRollerPosition + 1}`;
            this.elements.diceInfo.textContent = `等待 ${rollerName} 摇骰子...`;
        }
    }

    rollDice() {
        this.elements.rollDiceBtn.disabled = true;
        this.sendMessage({ type: 'rollDice' });
    }

    handleDiceRolled(data) {
        const { dice1, dice2, firstPlayer, dealerPosition } = data;
        
        // 更新庄位信息
        this.dealerPosition = dealerPosition;
        this.updateDealerBadges(dealerPosition);
        
        // 播放骰子动画
        this.playDiceAnimation(dice1, dice2, () => {
            // 动画结束后显示结果
            const firstPlayerName = this.players[firstPlayer]?.name || `玩家${firstPlayer + 1}`;
            const dealerName = this.players[dealerPosition]?.name || `玩家${dealerPosition + 1}`;
            
            this.elements.diceInfo.textContent = `点数：${dice1} + ${dice2} = ${dice1 + dice2}\n${firstPlayerName} 先出牌，${dealerName} 是庄家`;
            
            // 3秒后隐藏骰子，开始发牌
            setTimeout(() => {
                this.elements.diceContainer.classList.add('hidden');
            }, 3000);
        });
    }

    playDiceAnimation(result1, result2, callback) {
        const dice1El = this.elements.dice1;
        const dice2El = this.elements.dice2;
        const dice1Img = dice1El.querySelector('.dice-img');
        const dice2Img = dice2El.querySelector('.dice-img');
        
        // 在 3 秒内快速切换骰子图片
        let count = 0;
        const totalFrames = 30; // 30帧，每帧100ms，总共3秒
        
        const interval = setInterval(() => {
            const random1 = Math.floor(Math.random() * 6) + 1;
            const random2 = Math.floor(Math.random() * 6) + 1;
            
            dice1Img.src = `imgs/${random1}.svg`;
            dice2Img.src = `imgs/${random2}.svg`;
            
            count++;
            if (count >= totalFrames) {
                clearInterval(interval);
                
                // 显示最终结果
                dice1Img.src = `imgs/${result1}.svg`;
                dice2Img.src = `imgs/${result2}.svg`;
                
                if (callback) callback();
            }
        }, 100); // 每100ms切换一次图片
    }

    updateGamePlayerNames() {
        // 更新所有4个座位的玩家信息
        for (let pos = 0; pos < 4; pos++) {
            const nameEl = this.elements[`pos${pos}PlayerName`];
            const zoneEl = document.querySelector(`.zone-pos${pos}`);
            
            if (nameEl && this.players[pos]) {
                nameEl.textContent = this.players[pos].name;
                
                // 如果是自己，添加特殊样式
                if (pos === this.position) {
                    nameEl.textContent = this.players[pos].name + ' (我)';
                    if (zoneEl) {
                        const avatarEl = zoneEl.querySelector('.opponent-avatar');
                        if (avatarEl) {
                            avatarEl.classList.add('avatar-self');
                        }
                    }
                }
            } else if (nameEl) {
                nameEl.textContent = `座位${pos + 1}`;
            }
            
            // 更新头像数字
            if (zoneEl) {
                const avatarEl = zoneEl.querySelector('.opponent-avatar');
                if (avatarEl) {
                    avatarEl.textContent = pos + 1;
                }
            }
        }
    }

    updateDealerBadges(dealerPosition) {
        // 隐藏所有庄位标记
        for (let i = 0; i < 4; i++) {
            this.elements[`pos${i}DealerBadge`]?.classList.add('hidden');
        }
        
        // 显示庄位标记
        if (dealerPosition >= 0 && dealerPosition < 4) {
            this.elements[`pos${dealerPosition}DealerBadge`]?.classList.remove('hidden');
        }
    }

    handleDealCards(data) {
        this.hand = data.cards;
        this.position = data.position;
        
        this.renderHand();
        
        // 显示其他玩家的牌背
        this.renderOpponentCards();
        
        // 更新自己的牌数
        const myCardsCount = this.elements[`pos${this.position}CardsCount`];
        if (myCardsCount) {
            myCardsCount.textContent = `${this.hand.length}张`;
        }
    }

    renderHand() {
        this.elements.playerCards.innerHTML = '';
        this.hand.forEach(card => {
            const cardEl = this.createCardElement(card, false);
            
            // 恢复选中状态
            const isSelected = this.selectedCards.find(c => c.id === card.id);
            if (isSelected) {
                cardEl.classList.add('selected');
            }
            
            cardEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleCardSelection(card);
            });
            this.elements.playerCards.appendChild(cardEl);
        });
    }

    createCardElement(card, isSmall = false) {
        const cardEl = document.createElement('div');
        cardEl.className = 'card' + (isSmall ? ' small' : '');
        cardEl.dataset.cardId = card.id;

        const img = document.createElement('img');
        img.src = `imgs/${card.image}`;
        img.alt = card.name;
        cardEl.appendChild(img);

        return cardEl;
    }

    toggleCardSelection(card) {
        const index = this.selectedCards.findIndex(c => c.id === card.id);
        const cardEl = this.elements.playerCards.querySelector(`[data-card-id="${card.id}"]`);
        
        if (!cardEl) return;
        
        if (index !== -1) {
            this.selectedCards.splice(index, 1);
            cardEl.classList.remove('selected');
        } else {
            this.selectedCards.push(card);
            cardEl.classList.add('selected');
        }

        // 更新按钮状态
        this.updatePlayButton();
    }

    updatePlayButton() {
        const canPlay = this.selectedCards.length > 0 && this.isMyTurn();
        this.elements.playBtn.disabled = !canPlay;
    }

    isMyTurn() {
        return this.currentPlayer === this.position;
    }

    handleTurnChange(data) {
        this.currentPlayer = data.currentPlayer;
        this.updateTurnIndicator();
        this.updateControlButtons();
    }

    updateTurnIndicator() {
        // 清除所有玩家高亮
        document.querySelectorAll('.player-play-zone').forEach(el => {
            el.classList.remove('active');
        });
        
        const playerIndex = this.currentPlayer;
        const relativePos = (playerIndex - this.position + 4) % 4;
        const positions = ['你', '下家', '对家', '上家'];
        
        if (this.isMyTurn()) {
            this.elements.turnText.textContent = '轮到你';
            this.elements.turnText.style.color = 'var(--gold-color)';
        } else {
            this.elements.turnText.textContent = `座位${playerIndex + 1} (${positions[relativePos]})`;
            this.elements.turnText.style.color = '#ccc';
        }
        
        // 高亮当前玩家的区域
        const zoneEl = document.querySelector(`.zone-pos${playerIndex}`);
        if (zoneEl) {
            zoneEl.classList.add('active');
        }
    }

    updateControlButtons() {
        const isMyTurn = this.isMyTurn();
        // 在等待服务器确认时禁用操作按钮
        if (this.awaitingPlayConfirmation) {
            this.elements.playBtn.disabled = true;
            this.elements.passBtn.disabled = true;
            return;
        }

        this.elements.playBtn.disabled = !isMyTurn || this.selectedCards.length === 0;
        this.elements.passBtn.disabled = !isMyTurn;
    }

    // 客户端验证出牌组合（与服务器逻辑一致）
    validatePlay(cards) {
        if (!cards || cards.length === 0) {
            return { valid: false, error: '请选择要出的牌' };
        }

        // 检查牌是否在手中
        for (const card of cards) {
            if (!this.hand.find(c => c.id === card.id)) {
                return { valid: false, error: '您没有这张牌' };
            }
        }

        // 获取当前栋中有效的出牌
        const activePlays = this.currentDong.filter(d => d.cards && d.cards.length > 0);

        // 如果是第一个出牌
        if (activePlays.length === 0) {
            return this.validateFirstPlay(cards);
        } else {
            // 跟牌
            return this.validateFollowPlay(cards, activePlays);
        }
    }

    validateFirstPlay(cards) {
        if (cards.length === 1) {
            return { valid: true };
        } else if (cards.length === 2) {
            // 检查特殊组合（母至尊）
            const special = this.checkSpecialCombination(cards);
            if (special.isSpecial) {
                return { valid: true };
            }

            // 检查文牌对子
            if (cards[0].type === 'wen' && cards[1].type === 'wen' && cards[0].rank === cards[1].rank) {
                return { valid: true };
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
                        return { valid: true };
                    }
                }
            }

            return { valid: false, error: '两张牌必须是文牌对子、武牌对子或特殊组合' };
        } else {
            return { valid: false, error: '一次只能出1张或2张牌（对子或特殊组合）' };
        }
    }

    checkSpecialCombination(cards) {
        if (cards.length !== 2) {
            return { isSpecial: false };
        }

        const names = cards.map(c => c.name).sort();
        
        // 母至尊：三点 + 六点
        if ((names.includes('三点') && names.includes('六点')) ||
            (cards[0].name === '三点' && cards[1].name === '六点') ||
            (cards[0].name === '六点' && cards[1].name === '三点')) {
            return { isSpecial: true, type: 'muZhiZun' };
        }

        return { isSpecial: false };
    }

    validateFollowPlay(cards, activePlays) {
        const lastPlay = activePlays[activePlays.length - 1];
        const requiredCount = lastPlay.cards.length;

        if (cards.length !== requiredCount) {
            return { valid: false, error: `需要出${requiredCount}张牌` };
        }

        // 检查当前牌的特殊组合
        const currentSpecial = this.checkSpecialCombination(cards);

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
                    return { valid: true };
                } else {
                    return { valid: false, error: '文至尊只有高脚七对子能打' };
                }
            }

            // 检查当前是否是文至尊或母至尊
            const currentIsWenZhiZun = cards[0].rank === 11 && 
                                        cards[1].rank === 11 && 
                                        cards[0].type === 'wen';
            
            if (currentIsWenZhiZun || currentSpecial.type === 'muZhiZun') {
                return { valid: true };
            }

            // 检查上家和当前牌是否是合法对子
            const lastIsPair = this.isPairCards(lastPlay.cards);
            const currentIsPair = this.isPairCards(cards);

            if (!lastIsPair && !lastSpecial.isSpecial) {
                return { valid: false, error: '上家不是对子' };
            }

            if (!currentIsPair && !currentSpecial.isSpecial) {
                return { valid: false, error: '必须出对子或特殊组合' };
            }

            // 比较对子大小
            const canBeat = this.canBeatPair(cards, lastPlay.cards);
            if (!canBeat) {
                return { valid: false, error: '您的对子不够大' };
            }

            return { valid: true };
        }

        // 单张比较
        if (cards[0].rank >= lastPlay.cards[0].rank) {
            return { valid: false, error: '您的牌不够大' };
        }

        return { valid: true };
    }

    // 检查两张牌是否构成合法对子
    isPairCards(cards) {
        if (cards.length !== 2) return false;

        // 文牌对子
        if (cards[0].type === 'wen' && cards[1].type === 'wen' && cards[0].rank === cards[1].rank) {
            return true;
        }

        // 武牌对子
        if (cards[0].type === 'wu' && cards[1].type === 'wu') {
            const ranks = [cards[0].rank, cards[1].rank].sort((a, b) => b - a);
            const validWuPairs = [
                [9, 6], [9, 5], [9, 8], [8, 7], [7, 6], [5, 3]
            ];
            for (const validPair of validWuPairs) {
                if (ranks[0] === validPair[0] && ranks[1] === validPair[1]) {
                    return true;
                }
            }
        }

        return false;
    }

    // 比较两个对子的大小（返回true表示cards1能打败cards2）
    canBeatPair(cards1, cards2) {
        // 文牌对子 vs 文牌对子：rank越小越大
        if (cards1[0].type === 'wen' && cards2[0].type === 'wen') {
            return cards1[0].rank < cards2[0].rank;
        }

        // 武牌对子 vs 武牌对子：按照固定顺序
        if (cards1[0].type === 'wu' && cards2[0].type === 'wu') {
            const wuPairOrder = [
                [9, 6], // 至尊 - 最大
                [9, 5], // 饿五
                [9, 8], // 杂九
                [8, 7], // 杂八
                [7, 6], // 杂七
                [5, 3]  // 杂五 - 最小
            ];

            const ranks1 = [cards1[0].rank, cards1[1].rank].sort((a, b) => b - a);
            const ranks2 = [cards2[0].rank, cards2[1].rank].sort((a, b) => b - a);

            const order1 = wuPairOrder.findIndex(p => p[0] === ranks1[0] && p[1] === ranks1[1]);
            const order2 = wuPairOrder.findIndex(p => p[0] === ranks2[0] && p[1] === ranks2[1]);

            return order1 < order2; // 索引越小越大
        }

        // 文牌对子 vs 武牌对子：文牌对子更大
        if (cards1[0].type === 'wen' && cards2[0].type === 'wu') {
            return true;
        }

        // 武牌对子 vs 文牌对子：武牌对子更小
        if (cards1[0].type === 'wu' && cards2[0].type === 'wen') {
            return false;
        }

        return false;
    }

    playSelectedCards() {
        if (this.selectedCards.length === 0) {
            return;
        }

        // 客户端先验证
        const validation = this.validatePlay(this.selectedCards);
        if (!validation.valid) {
            return;
        }

        this.sendMessage({
            type: 'playCards',
            cards: this.selectedCards
        });
        // 等待服务器确认再从本地移除手牌，防止非法组合时误删
        this.awaitingPlayConfirmation = true;
        // 禁用按钮，直到确认
        this.updateControlButtons();
    }

    pass() {
        // 过牌时需要丢弃与首家相同数量的牌
        const firstPlay = this.currentDong.find(play => !play.passed);
        if (firstPlay && firstPlay.cards.length > 0) {
            const requiredCount = firstPlay.cards.length;
            
            if (this.selectedCards.length !== requiredCount) {
                return;
            }
            
            this.sendMessage({ 
                type: 'pass',
                cards: this.selectedCards
            });
            
            // 从手牌中移除丢弃的牌
            this.selectedCards.forEach(card => {
                const index = this.hand.findIndex(c => c.id === card.id);
                if (index !== -1) {
                    this.hand.splice(index, 1);
                }
            });
            
            // 清空选中的牌
            this.selectedCards = [];
            
            this.renderHand();
        } else {
            // 首家不能过牌，或者没有首家出牌记录
            return;
        }
        
        this.updateControlButtons();
    }

    sortHand() {
        // 按rank排序
        this.hand.sort((a, b) => a.rank - b.rank);
        this.renderHand();
    }

    handleCardsPlayed(data) {
        // 更新当前栋状态
        this.currentDong = data.currentDong;
        this.renderPlayedCards(data.currentDong);

        // 如果是自己出的牌，才从本地手牌中移除并清空选中
        if (data.playerIndex === this.position) {
            // 从手牌中移除服务器确认的卡牌
            data.cards.forEach(card => {
                const index = this.hand.findIndex(c => c.id === card.id);
                if (index !== -1) {
                    this.hand.splice(index, 1);
                }
            });

            // 清空已选牌与等待标记
            this.selectedCards = [];
            this.awaitingPlayConfirmation = false;
            this.renderHand();
            this.updateControlButtons();
            
            // 更新自己的牌数
            const myCardsCount = this.elements[`pos${this.position}CardsCount`];
            if (myCardsCount) {
                myCardsCount.textContent = `${this.hand.length}张`;
            }
        } else {
            // 更新对手剩余牌数
            this.updateOpponentCardCount(data.playerIndex, -data.cards.length);
        }
    }

    handlePlayerPassed(data) {
        // 更新当前栋状态，添加过牌记录
        this.currentDong.push({
            playerId: data.playerId,
            playerIndex: data.playerIndex,
            cards: data.discardedCards || [],
            passed: true
        });
        
        // 重新渲染所有出牌区域
        this.renderPlayedCards(this.currentDong);
    }

    renderPlayedCards(currentDong) {
        // 清空所有4个座位的出牌区域
        for (let pos = 0; pos < 4; pos++) {
            const area = document.getElementById(`pos${pos}PlayedCards`);
            if (area) area.innerHTML = '';
        }
        
        // 渲染每个玩家的出牌
        currentDong.forEach(play => {
            const area = document.getElementById(`pos${play.playerIndex}PlayedCards`);
            
            if (area && play.cards && play.cards.length > 0) {
                if (play.passed) {
                    // 过牌：显示丢弃的牌，使用throw.svg背景
                    play.cards.forEach(card => {
                        const cardEl = document.createElement('div');
                        cardEl.className = 'card discarded-card';
                        cardEl.style.backgroundImage = 'url(imgs/throw.svg)';
                        cardEl.style.backgroundSize = 'contain';
                        cardEl.style.backgroundRepeat = 'no-repeat';
                        cardEl.style.backgroundPosition = 'center';
                        area.appendChild(cardEl);
                    });
                } else {
                    // 正常出牌：显示实际的牌
                    play.cards.forEach(card => {
                        const cardEl = this.createCardElement(card, true);
                        area.appendChild(cardEl);
                    });
                }
            }
        });
    }

    handleDongFinished(data) {
        const relativePos = (data.winner - this.position + 4) % 4;
        const positions = ['你', '下家', '对家', '上家'];
        
        this.elements.currentRound.textContent = data.round;
        
        // 更新栋数显示
        if (data.dongScores) {
            this.updateDongScores(data.dongScores);
        }
        
        // 更新积分显示
        if (data.scores) {
            this.updateScores(data.scores);
        }
    }

    updateDongScores(dongScores) {
        // 更新总览显示
        if (this.elements.dongScoresDisplay) {
            this.elements.dongScoresDisplay.textContent = dongScores.join('-');
        }

        // 更新所有玩家的栋数显示
        for (let i = 0; i < 4; i++) {
            this.updateOpponentDongCount(i, dongScores[i]);
        }
    }

    updateScores(scores) {
        if (this.elements.scoresDisplay) {
            this.elements.scoresDisplay.textContent = scores.join('-');
        }
    }

    handleNewDong(data) {
        // 清空所有出牌区域
        for (let pos = 0; pos < 4; pos++) {
            const area = document.getElementById(`pos${pos}PlayedCards`);
            if (area) area.innerHTML = '';
        }
        
        this.currentDong = []; // 清空当前栋
        this.currentPlayer = data.currentPlayer;
        
        // 更新庄位（如果有提供）
        if (data.dealerPosition !== undefined) {
            this.dealerPosition = data.dealerPosition;
            this.updateDealerBadges(data.dealerPosition);
        }
        
        this.updateTurnIndicator();
        this.updateControlButtons();
    }

    handleGameOver(data) {
        // 更新庄位（赢家成为新庄）
        if (data.winner !== undefined) {
            this.dealerPosition = data.winner;
            this.updateDealerBadges(data.winner);
        }
        
        setTimeout(() => {
            this.showScreen('gameOver');
            const relativePos = (data.winner - this.position + 4) % 4;
            const positions = ['你', '下家', '对家', '上家'];
            let winText = `${data.winnerName} (${positions[relativePos]}) 获胜！`;
            
            if (data.finalScores) {
                winText += `\n最终积分：${data.finalScores.join('-')}`;
            }
            
            this.elements.winnerName.textContent = winText;
        }, 2000);
    }

    renderOpponentCards() {
        // 移动端不显示牌背预览，只显示数量
        // 牌数通过updateOpponentCardCount单独更新
    }

    updateOpponentCardCount(playerIndex, change) {
        const countEl = this.elements[`pos${playerIndex}CardsCount`];

        if (countEl) {
            // 从当前显示的数字中计算新值
            const currentText = countEl.textContent;
            const currentCount = parseInt(currentText) || 8;
            const newCount = Math.max(0, currentCount + change);
            
            countEl.textContent = `${newCount}张`;
        }
    }

    updateOpponentDongCount(playerIndex, dongCount) {
        const dongEl = this.elements[`pos${playerIndex}DongCount`];
        
        if (dongEl) {
            dongEl.textContent = `${dongCount}栋`;
        }
    }

    playAgain() {
        window.location.reload();
    }

    backToLobby() {
        window.location.reload();
    }

    showScreen(screenName) {
        Object.values(this.screens).forEach(screen => {
            screen.classList.add('hidden');
        });
        this.screens[screenName].classList.remove('hidden');
    }

    showToast(message, duration = 2000) {
        this.elements.toast.textContent = message;
        this.elements.toast.classList.remove('hidden');
        
        setTimeout(() => {
            this.elements.toast.classList.add('hidden');
        }, duration);
    }
}

// 初始化游戏
const game = new TianJiuGame();
