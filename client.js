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
        this.outPlayers = [false, false, false, false]; // 标记哪些玩家被OUT
        
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
            kamValue: document.getElementById('kamValue'),
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
        
        // Kam 点击事件 - 赢家点击触发支付界面
        const kamInfo = document.getElementById('kamInfo');
        if (kamInfo) {
            kamInfo.addEventListener('click', () => this.handleKamClick());
        }
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
            case 'gameEnd':
                this.handleGameEnd(data);
                break;
            case 'specialComboSettlement':
                this.handleSpecialComboSettlement(data);
                break;
            case 'scoreTransfer':
                this.handleScoreTransfer(data);
                break;
            case 'kamPayment':
                this.handleKamPayment(data);
                break;
            case 'winnerPenalty':
                this.handleWinnerPenalty(data);
                break;
            case 'settlementFinished':
                this.handleSettlementFinished(data);
                break;
            case 'newGame':
                this.handleNewGame(data);
                break;
            case 'playerOut':
                this.handlePlayerOut(data);
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
        
        // 重置OUT状态
        this.outPlayers = [false, false, false, false];
        // 移除所有OUT标记
        document.querySelectorAll('.out-badge').forEach(badge => badge.remove());
        
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
        
        // 更新Kam显示（如果gameState中有publicPool数据）
        if (data.gameState && typeof data.gameState.publicPool !== 'undefined') {
            this.updatePublicPoolDisplay(data.gameState.publicPool);
        }
        
        // 更新积分显示（如果gameState中有scores数据）
        if (data.gameState && data.gameState.scores) {
            this.updateScoresDisplay(data.gameState.scores);
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
        
        // 轮次指示已移除，改为使用高亮显示
        // 如果需要可以通过toast提示
        if (this.isMyTurn()) {
            // 可选：显示轮到你的提示
            // this.showToast('轮到你', 1000);
        }
        
        // 高亮当前玩家的区域
        const zoneEl = document.querySelector(`.zone-pos${playerIndex}`);
        if (zoneEl) {
            zoneEl.classList.add('active');
        }
    }

    updateControlButtons() {
        const isMyTurn = this.isMyTurn();
        // 检查当前玩家是否被OUT
        const isOut = this.outPlayers[this.position];
        
        // 在等待服务器确认时禁用操作按钮
        if (this.awaitingPlayConfirmation) {
            this.elements.playBtn.disabled = true;
            this.elements.passBtn.disabled = true;
            return;
        }

        // 如果被OUT，禁用所有操作
        if (isOut) {
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
            // 检查特殊组合（至尊）
            const special = this.checkSpecialCombination(cards);
            if (special.isSpecial) {
                return { valid: true };
            }

            const pairType = this.getPairType(cards);
            if (pairType) {
                return { valid: true };
            }

            return { valid: false, error: '两张牌必须是文对、武对、文武对或特殊组合' };
        } else if (cards.length === 3) {
            // 检查3张牌的文武组合
            const tripleType = this.getTripleWenWuType(cards);
            if (tripleType) {
                return { valid: true };
            }
            return { valid: false, error: '三张牌必须是有效的文武组合（如：三人七）' };
        } else if (cards.length === 4) {
            // 检查4张牌的文武组合
            const quadType = this.getQuadWenWuType(cards);
            if (quadType) {
                return { valid: true };
            }
            return { valid: false, error: '四张牌必须是有效的文武组合（如：四人七）' };
        } else {
            return { valid: false, error: '一次只能出1张、2张、3张或4张牌' };
        }
    }

    // 判断两张牌的对子类型
    getPairType(cards) {
        if (cards.length !== 2) return null;

        const card1 = cards[0];
        const card2 = cards[1];

        // 文对：两张相同名称的文牌
        if (card1.type === 'wen' && card2.type === 'wen' && card1.name === card2.name) {
            return 'wen';
        }

        // 武对：两张相同点数的武牌
        if (card1.type === 'wu' && card2.type === 'wu') {
            const points1 = card1.points;
            const points2 = card2.points;
            
            if (points1 === points2) {
                return 'wu';
            }
        }

        // 文武对：文牌+武牌的特定组合
        if ((card1.type === 'wen' && card2.type === 'wu') || (card1.type === 'wu' && card2.type === 'wen')) {
            const wenCard = card1.type === 'wen' ? card1 : card2;
            const wuCard = card1.type === 'wu' ? card1 : card2;
            
            // 天九：天 + 九点
            if (wenCard.name === '天' && wuCard.points === 9) {
                return 'wenwu';
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

        return null;
    }

    // 检查3张牌的文武组合
    getTripleWenWuType(cards) {
        if (cards.length !== 3) return null;

        const wenCards = cards.filter(c => c.type === 'wen');
        const wuCards = cards.filter(c => c.type === 'wu');

        if ((wenCards.length === 2 && wuCards.length === 1) || 
            (wenCards.length === 1 && wuCards.length === 2)) {
            
            // 天九
            if (this.checkTripleWenWu(wenCards, wuCards, '天', 9)) {
                return { type: 'tianJiu', name: '三天九' };
            }
            // 地八
            if (this.checkTripleWenWu(wenCards, wuCards, '地', 8)) {
                return { type: 'diBa', name: '三地八' };
            }
            // 人七
            if (this.checkTripleWenWu(wenCards, wuCards, '人', 7)) {
                return { type: 'renQi', name: '三人七' };
            }
            // 和五
            if (this.checkTripleWenWu(wenCards, wuCards, '和', 5)) {
                return { type: 'heWu', name: '三和五' };
            }
        }

        return null;
    }

    // 检查4张牌的文武组合（2文+2武）
    getQuadWenWuType(cards) {
        if (cards.length !== 4) return null;

        const wenCards = cards.filter(c => c.type === 'wen');
        const wuCards = cards.filter(c => c.type === 'wu');

        // 必须是2文+2武
        if (wenCards.length === 2 && wuCards.length === 2) {
            // 天九：2天+2九点
            if (this.checkQuadWenWu(wenCards, wuCards, '天', 9)) {
                return { type: 'tianJiu', name: '四天九' };
            }
            // 地八：2地+2八点
            if (this.checkQuadWenWu(wenCards, wuCards, '地', 8)) {
                return { type: 'diBa', name: '四地八' };
            }
            // 人七：2人+2七点
            if (this.checkQuadWenWu(wenCards, wuCards, '人', 7)) {
                return { type: 'renQi', name: '四人七' };
            }
            // 和五：2和+2五点
            if (this.checkQuadWenWu(wenCards, wuCards, '和', 5)) {
                return { type: 'heWu', name: '四和五' };
            }
        }

        return null;
    }

    checkQuadWenWu(wenCards, wuCards, wenName, wuPoints) {
        // 2文牌必须都是指定名称，2武牌必须都是指定点数
        return wenCards.every(c => c.name === wenName) && 
               wuCards.every(c => c.points === wuPoints);
    }

    checkTripleWenWu(wenCards, wuCards, wenName, wuPoints) {
        if (wenCards.length === 2 && wuCards.length === 1) {
            return wenCards.every(c => c.name === wenName) && 
                   wuCards[0].points === wuPoints;
        }
        if (wenCards.length === 1 && wuCards.length === 2) {
            return wenCards[0].name === wenName && 
                   wuCards.every(c => c.points === wuPoints);
        }
        return false;
    }

    checkSpecialCombination(cards) {
        if (cards.length !== 2) {
            return { isSpecial: false };
        }

        const card1 = cards[0];
        const card2 = cards[1];

        // 至尊(武尊)：三点 + 六点
        if (card1.type === 'wu' && card2.type === 'wu') {
            const names = [card1.name, card2.name].sort();
            if ((names[0] === '三点' && names[1] === '六点') ||
                (card1.points === 3 && card2.points === 6) ||
                (card1.points === 6 && card2.points === 3)) {
                return { isSpecial: true, type: 'zhiZun' };
            }
        }

        // 文至尊：双伶冧六
        if (card1.type === 'wen' && card2.type === 'wen' && 
            card1.name === '伶冧六' && card2.name === '伶冧六') {
            return { isSpecial: true, type: 'wenZhiZun' };
        }

        return { isSpecial: false };
    }

    validateFollowPlay(cards, activePlays) {
        // 找到最后一个非过牌的有效出牌作为比较基准
        let lastPlay = null;
        for (let i = activePlays.length - 1; i >= 0; i--) {
            if (!activePlays[i].passed) {
                lastPlay = activePlays[i];
                break;
            }
        }
        
        // 如果所有人都过牌了，不应该发生
        if (!lastPlay) {
            return { valid: false, error: '没有有效的出牌可以比较' };
        }
        
        const requiredCount = lastPlay.cards.length;

        if (cards.length !== requiredCount) {
            return { valid: false, error: `需要出${requiredCount}张牌` };
        }

        // 单张逻辑
        if (requiredCount === 1) {
            const lastCard = lastPlay.cards[0];
            const currentCard = cards[0];

            // 必须同类型
            if (lastCard.type !== currentCard.type) {
                return { valid: false, error: '必须出同类型的牌' };
            }

            // power越大越强（使用服务器的power值）
            if (currentCard.power <= lastCard.power) {
                if (currentCard.power === lastCard.power) {
                    return { valid: false, error: '相同的牌，先出为大，无法打出' };
                }
                return { valid: false, error: '您的牌不够大' };
            }

            return { valid: true };
        }

        // 3张牌逻辑
        if (requiredCount === 3) {
            const lastTriple = this.getTripleWenWuType(lastPlay.cards);
            const currentTriple = this.getTripleWenWuType(cards);

            if (!lastTriple) {
                return { valid: false, error: '上家不是有效的三张组合' };
            }

            if (!currentTriple) {
                return { valid: false, error: '必须出有效的三张文武组合' };
            }

            // 必须严格配对：2文+1武 对 2文+1武，1文+2武 对 1文+2武
            const lastWenCount = lastPlay.cards.filter(c => c.type === 'wen').length;
            const currentWenCount = cards.filter(c => c.type === 'wen').length;

            if (lastWenCount !== currentWenCount) {
                const lastDesc = lastWenCount === 2 ? '2文+1武' : '1文+2武';
                const currentDesc = currentWenCount === 2 ? '2文+1武' : '1文+2武';
                return { valid: false, error: `上家是${lastDesc}，您必须出${lastDesc}才能打（您出的是${currentDesc}）` };
            }

            // 配对后比较组合类型：天九 > 地八 > 人七 > 和五
            // 先出为大：相同组合无法打出
            const typeOrder = { 'tianJiu': 1, 'diBa': 2, 'renQi': 3, 'heWu': 4 };
            const currentOrder = typeOrder[currentTriple.type];
            const lastOrder = typeOrder[lastTriple.type];
            
            if (currentOrder >= lastOrder) {
                if (currentOrder === lastOrder) {
                    return { valid: false, error: `相同的${currentTriple.name}，先出为大，无法打出` };
                }
                return { valid: false, error: `${currentTriple.name}打不过${lastTriple.name}` };
            }

            return { valid: true };
        }

        // 4张牌逻辑
        if (requiredCount === 4) {
            const lastQuad = this.getQuadWenWuType(lastPlay.cards);
            const currentQuad = this.getQuadWenWuType(cards);

            if (!lastQuad) {
                return { valid: false, error: '上家不是有效的四张组合' };
            }

            if (!currentQuad) {
                return { valid: false, error: '必须出有效的四张文武组合（2文+2武）' };
            }

            // 四张牌都是2文+2武，只需比较是哪种组合
            // 天九 > 地八 > 人七 > 和五
            const typeOrder = { 'tianJiu': 1, 'diBa': 2, 'renQi': 3, 'heWu': 4 };
            const currentOrder = typeOrder[currentQuad.type];
            const lastOrder = typeOrder[lastQuad.type];

            if (currentOrder >= lastOrder) {
                if (currentOrder === lastOrder) {
                    return { valid: false, error: `相同的${currentQuad.name}，先出为大，无法打出` };
                }
                return { valid: false, error: `${currentQuad.name}打不过${lastQuad.name}` };
            }

            return { valid: true };
        }

        // 对子逻辑 (requiredCount === 2)
        const lastSpecial = this.checkSpecialCombination(lastPlay.cards);
        const currentSpecial = this.checkSpecialCombination(cards);
        
        // 判断上家是否是先出（currentDong中第一个出牌）
        const isLastPlayFirst = activePlays.length === 1;
        
        // 至尊(武尊)特殊规则：只有先出时才无敌
        if (lastSpecial.type === 'zhiZun') {
            if (isLastPlayFirst) {
                return { valid: false, error: '至尊先出无敌，无法打败' };
            }
            // 至尊跟牌时按正常power=9计算，基本所有对子都能打
        }

        // 当前出至尊：先出时无敌，跟牌时power=9（很小）
        if (currentSpecial.type === 'zhiZun') {
            if (!isLastPlayFirst) {
                // 如果不是第一轮，至尊跟牌power很小，提示一下
                console.log('至尊跟牌时power=9，可能打不过上家');
            }
            // 让服务器做最终判断
            return { valid: true };
        }

        // 文至尊特殊规则：先出时只有双高脚七能打
        if (lastSpecial.type === 'wenZhiZun') {
            if (isLastPlayFirst) {
                const isGaoJiaoQi = cards[0].type === 'wen' && cards[1].type === 'wen' && 
                                    cards[0].name === '高脚七' && cards[1].name === '高脚七';
                if (isGaoJiaoQi) {
                    return { valid: true };
                }
                return { valid: false, error: '文至尊先出时，只有双高脚七能打' };
            }
            // 文至尊跟牌时按正常power=50计算
        }

        if (currentSpecial.type === 'wenZhiZun') {
            if (!isLastPlayFirst) {
                console.log('文至尊跟牌时power=50');
            }
            // 让服务器做最终判断
            return { valid: true };
        }

        // 普通对子比较
        const lastPairType = this.getPairType(lastPlay.cards);
        const currentPairType = this.getPairType(cards);

        if (!lastPairType) {
            return { valid: false, error: '上家不是有效对子' };
        }

        if (!currentPairType) {
            // 提供更详细的错误信息
            const cardTypes = cards.map(c => c.type).join(', ');
            const cardNames = cards.map(c => c.name).join(' + ');
            return { valid: false, error: `${cardNames} 不是有效的对子` };
        }

        // 必须同类型
        if (lastPairType !== currentPairType) {
            const typeNames = {
                'wen': '文对',
                'wu': '武对',
                'wenwu': '文武对'
            };
            const lastTypeName = typeNames[lastPairType] || lastPairType;
            const currentTypeName = typeNames[currentPairType] || currentPairType;
            return { valid: false, error: `上家出的是${lastTypeName}，您出的是${currentTypeName}，类型不匹配` };
        }

        // 比大小
        return this.comparePairs(cards, lastPlay.cards, currentPairType);
    }

    // 比较两个对子的大小
    comparePairs(cards1, cards2, pairType) {
        if (pairType === 'wen') {
            // 文对：使用power，power越大越强，先出为大
            const power1 = cards1[0].power + cards1[1].power;
            const power2 = cards2[0].power + cards2[1].power;
            
            if (power1 <= power2) {
                if (power1 === power2) {
                    return { valid: false, error: '相同的文对，先出为大，无法打出' };
                }
                return { valid: false, error: '您的文对不够大' };
            }
            return { valid: true };
        }

        if (pairType === 'wu') {
            // 武对：使用points，点数越大越强，先出为大
            const points1 = cards1[0].points;
            const points2 = cards2[0].points;
            
            if (points1 <= points2) {
                if (points1 === points2) {
                    return { valid: false, error: '相同的武对，先出为大，无法打出' };
                }
                return { valid: false, error: '您的武对不够大' };
            }
            return { valid: true };
        }

        if (pairType === 'wenwu') {
            // 文武对：使用power，power越大越强，先出为大
            const power1 = cards1[0].power + cards1[1].power;
            const power2 = cards2[0].power + cards2[1].power;

            if (power1 <= power2) {
                if (power1 === power2) {
                    return { valid: false, error: '相同的文武对，先出为大，无法打出' };
                }
                return { valid: false, error: '您的文武对不够大' };
            }
            return { valid: true };
        }

        return { valid: false, error: '未知的对子类型' };
    }

    playSelectedCards() {
        if (this.selectedCards.length === 0) {
            return;
        }

        // 客户端先验证
        const validation = this.validatePlay(this.selectedCards);
        if (!validation.valid) {
            // 显示错误提示
            this.showError(validation.error || '出牌无效');
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

    showError(message) {
        // 创建错误提示元素
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-toast';
        errorDiv.textContent = message;
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(220, 38, 38, 0.95);
            color: white;
            padding: 16px 32px;
            border-radius: 8px;
            font-size: 18px;
            font-weight: bold;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: fadeInOut 2s ease-in-out;
        `;

        // 添加动画样式
        if (!document.getElementById('error-toast-style')) {
            const style = document.createElement('style');
            style.id = 'error-toast-style';
            style.textContent = `
                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translate(-50%, -60%); }
                    15% { opacity: 1; transform: translate(-50%, -50%); }
                    85% { opacity: 1; transform: translate(-50%, -50%); }
                    100% { opacity: 0; transform: translate(-50%, -40%); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(errorDiv);

        // 2秒后自动移除
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 2000);
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
        // 按类型和power排序：先文后武，同类型按power从大到小
        this.hand.sort((a, b) => {
            // 文牌在前，武牌在后
            if (a.type !== b.type) {
                return a.type === 'wen' ? -1 : 1;
            }
            // 同类型按power降序（大牌在前）
            return b.power - a.power;
        });
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
        }
        
        // 使用服务器发送的准确手牌数量更新所有玩家
        if (data.handCounts) {
            for (let i = 0; i < 4; i++) {
                const cardsCount = this.elements[`pos${i}CardsCount`];
                if (cardsCount) {
                    cardsCount.textContent = `${data.handCounts[i]}张`;
                }
            }
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
        
        // 使用服务器发送的准确手牌数量更新所有玩家
        if (data.handCounts) {
            for (let i = 0; i < 4; i++) {
                const cardsCount = this.elements[`pos${i}CardsCount`];
                if (cardsCount) {
                    cardsCount.textContent = `${data.handCounts[i]}张`;
                }
            }
        }
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
        
        // currentRound element has been removed from UI
        // Round information is now shown in settlement panel
        
        // 更新栋数显示
        if (data.dongScores) {
            this.updateDongScores(data.dongScores);
        }
        
        // 更新积分显示（两个方法都调用以确保所有UI都更新）
        if (data.scores) {
            this.updateScores(data.scores);
            this.updateScoresDisplay(data.scores);
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

    handleSpecialComboSettlement(data) {
        // 特殊牌型结算（至尊、四天九等）
        this.currentSettlement = {
            winner: data.playerIndex,
            winnerName: data.playerName,
            specialCombo: data.specialCombo,
            scores: data.scores,
            publicPool: data.publicPool,
            paidAmount: 0,
            isSpecialCombo: true
        };
        
        // 重置支付计数器
        const paymentCounter = document.getElementById('paymentCounter');
        if (paymentCounter) {
            paymentCounter.textContent = '-0';
        }
        
        // 显示结算蒙层
        const settlementOverlay = document.getElementById('settlementOverlay');
        if (settlementOverlay) {
            settlementOverlay.classList.remove('hidden');
        }
        
        // 初始化钱箱交互
        this.initPiggyBankInteraction();
        
        // 提示特殊牌型
        this.showToast(`${data.playerName}出了${data.specialCombo.name}！`, 3000);
    }

    handleGameEnd(data) {
        // 一局游戏结束，显示交互式结算蒙层
        this.currentSettlement = {
            winner: data.winner,
            winnerName: data.winnerName,
            winnerDongs: data.winnerDongs,
            gameCount: data.gameCount,
            scores: data.scores,
            publicPool: data.publicPool,
            paidAmount: 0,
            winnerPaidToKam: false // 标记赢家是否支付给了 Kam
        };
        
        // 如果当前玩家是赢家，不自动显示结算界面
        // 赢家需要手动点击 Kam 触发支付
        if (this.position === data.winner) {
            // this.showToast('你赢了！点击 Kam 支付给公共池', 5000);
            // 高亮 Kam 提示点击
            const kamInfo = document.getElementById('kamInfo');
            if (kamInfo) {
                kamInfo.classList.add('highlight-kam');
            }
            return;
        }
        
        // 非赢家显示结算界面
        // 重置支付计数器
        const paymentCounter = document.getElementById('paymentCounter');
        if (paymentCounter) {
            paymentCounter.textContent = '-0';
        }
        
        // 显示结算蒙层
        const settlementOverlay = document.getElementById('settlementOverlay');
        if (settlementOverlay) {
            settlementOverlay.classList.remove('hidden');
        }
        
        // 初始化钱箱交互
        this.initPiggyBankInteraction();
    }

    handleKamClick() {
        // 检查是否在结算阶段且当前玩家是赢家
        if (!this.currentSettlement) {
            return;
        }
        
        if (this.position !== this.currentSettlement.winner) {
            this.showToast('只有赢家才能支付给 Kam！', 2000);
            return;
        }
        
        if (this.currentSettlement.winnerPaidToKam) {
            this.showToast('你已经支付过了！', 2000);
            return;
        }
        
        // 移除高亮
        const kamInfo = document.getElementById('kamInfo');
        if (kamInfo) {
            kamInfo.classList.remove('highlight-kam');
        }
        
        // 显示赢家支付界面
        const paymentCounter = document.getElementById('paymentCounter');
        if (paymentCounter) {
            paymentCounter.textContent = '-0';
        }
        
        const settlementOverlay = document.getElementById('settlementOverlay');
        if (settlementOverlay) {
            settlementOverlay.classList.remove('hidden');
        }
        
        // 初始化赢家专用的钱箱交互（支付给 Kam）
        this.initWinnerPiggyBankInteraction();
    }

    initWinnerPiggyBankInteraction() {
        // 赢家专用的钱箱交互，支付给 Kam
        const piggyBank = document.getElementById('piggyBank');
        const paymentCounter = document.getElementById('paymentCounter');
        const container = document.getElementById('piggyBankContainer');
        
        let startY = 0;
        let isDragging = false;
        let hasPaid = false;
        
        const handleStart = (e) => {
            if (isDragging) return;
            
            isDragging = true;
            hasPaid = false;
            startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
            piggyBank.style.cursor = 'grabbing';
        };
        
        const handleMove = (e) => {
            if (!isDragging || hasPaid) return;
            e.preventDefault();
            
            const currentY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
            const deltaY = startY - currentY;
            
            // 实时更新钱箱位置
            if (deltaY > 0) {
                piggyBank.style.transform = `translateY(${-Math.min(deltaY, 100)}px)`;
            } else {
                piggyBank.style.transform = `translateY(${Math.min(-deltaY, 50)}px)`;
            }
        };
        
        const handleEnd = (e) => {
            if (!isDragging) return;
            
            const currentY = e.type.includes('mouse') ? e.clientY : (e.changedTouches ? e.changedTouches[0].clientY : startY);
            const deltaY = startY - currentY;
            
            // 上滑：支付金币给 Kam
            if (deltaY > 50 && !hasPaid) {
                hasPaid = true;
                const coinsToAdd = Math.floor(deltaY / 50);
                
                // 发送支付给 Kam
                this.sendPaymentToKam(coinsToAdd);
                
                // 播放金币动画
                for (let i = 0; i < coinsToAdd; i++) {
                    setTimeout(() => {
                        this.createCoinAnimation(container);
                    }, i * 100);
                }
                
                // 更新支付计数器
                this.currentSettlement.paidAmount += coinsToAdd;
                this.currentSettlement.winnerPaidToKam = true;
                paymentCounter.textContent = `-${this.currentSettlement.paidAmount}`;
                paymentCounter.classList.add('show');
                setTimeout(() => {
                    paymentCounter.classList.remove('show');
                }, 500);
                
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
                
                // 延迟后自动关闭结算界面
                setTimeout(() => {
                    const settlementOverlay = document.getElementById('settlementOverlay');
                    if (settlementOverlay) {
                        settlementOverlay.classList.add('hidden');
                    }
                    this.showToast('已支付给 Kam，等待其他玩家...', 2000);
                }, 1000);
            }
            // 下滑：结束结算
            else if (deltaY < -50 && !hasPaid) {
                hasPaid = true;
                const settlementOverlay = document.getElementById('settlementOverlay');
                if (settlementOverlay) {
                    settlementOverlay.classList.add('hidden');
                }
                // 赢家不支付直接结束，标记未支付
                this.currentSettlement.winnerPaidToKam = false;
                this.showToast('你选择不支付 Kam，等待其他玩家...', 2000);
            }
            
            isDragging = false;
            piggyBank.style.transform = '';
            piggyBank.style.cursor = 'grab';
        };
        
        // 移除旧的事件监听器
        piggyBank.replaceWith(piggyBank.cloneNode(true));
        const newPiggyBank = document.getElementById('piggyBank');
        
        // 添加触摸事件
        newPiggyBank.addEventListener('touchstart', handleStart, { passive: false });
        newPiggyBank.addEventListener('touchmove', handleMove, { passive: false });
        newPiggyBank.addEventListener('touchend', handleEnd, { passive: false });
        newPiggyBank.addEventListener('touchcancel', handleEnd, { passive: false });
        
        // 添加鼠标事件
        newPiggyBank.addEventListener('mousedown', handleStart);
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
    }

    initPiggyBankInteraction() {
        const piggyBank = document.getElementById('piggyBank');
        const paymentCounter = document.getElementById('paymentCounter');
        const container = document.getElementById('piggyBankContainer');
        
        let startY = 0;
        let isDragging = false;
        let hasPaid = false; // 标记本次滑动是否已支付
        
        const handleStart = (e) => {
            // 只有非赢家才能支付
            if (this.position === this.currentSettlement.winner) {
                this.showToast('你是赢家，不需要支付！', 2000);
                return;
            }
            
            // 防止重复触发
            if (isDragging) return;
            
            isDragging = true;
            hasPaid = false; // 每次新手势开始时重置支付标记
            startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
            piggyBank.style.cursor = 'grabbing';
        };
        
        const handleMove = (e) => {
            if (!isDragging || hasPaid) return; // 已支付后不再响应移动
            e.preventDefault();
            
            const currentY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
            const deltaY = startY - currentY;
            
            // 实时更新钱箱位置
            if (deltaY > 0) {
                piggyBank.style.transform = `translateY(${-Math.min(deltaY, 100)}px)`;
            } else {
                piggyBank.style.transform = `translateY(${Math.min(-deltaY, 50)}px)`;
            }
        };
        
        const handleEnd = (e) => {
            if (!isDragging) return;
            
            const currentY = e.type.includes('mouse') ? e.clientY : (e.changedTouches ? e.changedTouches[0].clientY : startY);
            const deltaY = startY - currentY;
            
            // 上滑：支付金币（严格保证只触发一次）
            if (deltaY > 50 && !hasPaid) {
                hasPaid = true; // 立即标记已支付，防止重复
                const coinsToAdd = Math.floor(deltaY / 50); // 每50px滑动距离 = 1个金币
                
                // 一次性发送支付
                this.sendPayment(coinsToAdd);
                
                // 播放金币动画
                for (let i = 0; i < coinsToAdd; i++) {
                    setTimeout(() => {
                        this.createCoinAnimation(container);
                    }, i * 100);
                }
                
                // 更新支付计数器
                this.currentSettlement.paidAmount += coinsToAdd;
                paymentCounter.textContent = `-${this.currentSettlement.paidAmount}`;
                paymentCounter.classList.add('show');
                setTimeout(() => {
                    paymentCounter.classList.remove('show');
                }, 500);
                
                // 触觉反馈（如果支持）
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
            }
            // 下滑：结束结算
            else if (deltaY < -50 && !hasPaid) {
                hasPaid = true; // 防止重复触发结束
                this.finishSettlement();
            }
            
            // 重置状态
            isDragging = false;
            piggyBank.style.transform = '';
            piggyBank.style.cursor = 'grab';
        };
        
        // 移除旧的事件监听器
        piggyBank.replaceWith(piggyBank.cloneNode(true));
        const newPiggyBank = document.getElementById('piggyBank');
        
        // 添加触摸事件
        newPiggyBank.addEventListener('touchstart', handleStart, { passive: false });
        newPiggyBank.addEventListener('touchmove', handleMove, { passive: false });
        newPiggyBank.addEventListener('touchend', handleEnd, { passive: false });
        newPiggyBank.addEventListener('touchcancel', handleEnd, { passive: false }); // 处理触摸取消
        
        // 添加鼠标事件（桌面端）
        newPiggyBank.addEventListener('mousedown', handleStart);
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
    }
    
    createCoinAnimation(container) {
        const coin = document.createElement('div');
        coin.className = 'coin';
        
        // 随机位置
        const startX = container.offsetWidth / 2 + (Math.random() - 0.5) * 100;
        const startY = container.offsetHeight / 2;
        
        coin.style.position = 'absolute';
        coin.style.left = `${startX}px`;
        coin.style.top = `${startY}px`;
        coin.style.animation = 'coinFly 1s ease-out forwards';
        
        container.appendChild(coin);
        
        // 动画结束后移除
        setTimeout(() => {
            coin.remove();
            // 在赢家区域显示收钱动画
            this.showReceiveAnimation();
        }, 1000);
    }
    
    showReceiveAnimation() {
        const winnerZone = document.querySelector(`.zone-pos${this.currentSettlement.winner}`);
        if (winnerZone) {
            winnerZone.classList.add('receiving-coins');
            setTimeout(() => {
                winnerZone.classList.remove('receiving-coins');
            }, 1000);
        }
    }
    
    sendPayment(amount) {
        this.ws.send(JSON.stringify({
            type: 'manualPay',
            fromPlayer: this.position,
            toPlayer: this.currentSettlement.winner,
            amount: amount
        }));
    }
    
    sendPaymentToKam(amount) {
        // 赢家支付给 Kam
        this.ws.send(JSON.stringify({
            type: 'payToKam',
            fromPlayer: this.position,
            amount: amount
        }));
    }
    
    finishSettlement() {
        // 检查赢家是否支付了 Kam
        const winnerPaid = this.currentSettlement?.winnerPaidToKam || false;
        
        this.ws.send(JSON.stringify({
            type: 'finishSettlement',
            winnerPaidToKam: winnerPaid
        }));
        
        this.showToast('结算完成！', 2000);
    }
    
    handleScoreTransfer(data) {
        // 更新积分显示
        this.updateScoresDisplay(data.scores);
        
        // 显示转账动画提示
        const positions = ['你', '下家', '对家', '上家'];
        const fromPos = (data.fromPlayer - this.position + 4) % 4;
        const toPos = (data.toPlayer - this.position + 4) % 4;
        
        if (data.fromPlayer === this.position) {
            // 当前玩家支付
            const paymentCounter = document.getElementById('paymentCounter');
            if (paymentCounter) {
                const currentAmount = parseInt(paymentCounter.textContent.replace('-', '')) || 0;
                paymentCounter.textContent = `-${currentAmount + data.amount}`;
            }
        }
        
        // 触觉反馈
        if (navigator.vibrate && data.fromPlayer === this.position) {
            navigator.vibrate(30);
        }
    }
    
    handleKamPayment(data) {
        // 更新积分和 Kam 显示
        this.updateScoresDisplay(data.scores);
        this.updatePublicPoolDisplay(data.publicPool);
        
        // 显示支付提示
        if (data.fromPlayer === this.position) {
            this.showToast(`已支付 ${data.amount} 分给 Kam`, 2000);
        } else {
            const positions = ['你', '下家', '对家', '上家'];
            const fromPos = (data.fromPlayer - this.position + 4) % 4;
            this.showToast(`${positions[fromPos]}支付了 ${data.amount} 分给 Kam`, 2000);
        }
        
        // 触觉反馈
        if (navigator.vibrate && data.fromPlayer === this.position) {
            navigator.vibrate(50);
        }
    }
    
    handleWinnerPenalty(data) {
        // 更新积分和 Kam 显示
        this.updateScoresDisplay(data.scores);
        this.updatePublicPoolDisplay(data.publicPool);
        
        // 显示罚款提示
        if (data.playerIndex === this.position) {
            this.showToast(`⚠️ 你没有支付 Kam，被罚款 ${data.amount} 分！`, 4000);
        } else {
            const positions = ['你', '下家', '对家', '上家'];
            const pos = (data.playerIndex - this.position + 4) % 4;
            this.showToast(`${positions[pos]}没有支付 Kam，被罚款 ${data.amount} 分`, 3000);
        }
        
        // 触觉反馈
        if (navigator.vibrate && data.playerIndex === this.position) {
            navigator.vibrate([100, 50, 100]);
        }
    }
    
    handleSettlementFinished(data) {
        // 更新积分显示
        this.updateScoresDisplay(data.scores);
        this.updatePublicPoolDisplay(data.publicPool);
        
        // 隐藏结算蒙层
        const settlementOverlay = document.getElementById('settlementOverlay');
        if (settlementOverlay) {
            settlementOverlay.classList.add('hidden');
        }
        
        // 清除 Kam 高亮
        const kamInfo = document.getElementById('kamInfo');
        if (kamInfo) {
            kamInfo.classList.remove('highlight-kam');
        }
        
        this.showToast('准备下一局...', 2000);
    }

    handleNewGame(data) {
        // 新一局开始
        this.gameCount = data.gameCount;
        this.dealerPosition = data.dealerPosition;
        
        // 隐藏结算面板
        this.hideSettlementPanel();
        
        // 更新庄家标记
        this.updateDealerBadges(data.dealerPosition);
        
        // 更新公共池显示
        this.updatePublicPoolDisplay(data.publicPool);
        
        // 更新积分显示
        this.updateScoresDisplay(data.scores);
        
        this.showToast(`第${data.gameCount}局开始！`, 2000);
    }

    showSettlementPanel(html) {
        // 移除旧的结算面板
        const oldPanel = document.querySelector('.settlement-overlay');
        if (oldPanel) {
            oldPanel.remove();
        }
        
        // 创建新的结算面板
        const overlay = document.createElement('div');
        overlay.className = 'settlement-overlay';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        
        // 添加显示动画
        setTimeout(() => {
            overlay.classList.add('show');
        }, 10);
    }

    hideSettlementPanel() {
        const panel = document.querySelector('.settlement-overlay');
        if (panel) {
            panel.classList.remove('show');
            setTimeout(() => {
                panel.remove();
            }, 300);
        }
    }

    getDealerName(dealerIndex) {
        const relativePos = (dealerIndex - this.position + 4) % 4;
        const positions = ['你', '下家', '对家', '上家'];
        return positions[relativePos];
    }

    updatePublicPoolDisplay(amount) {
        // 更新Kam值显示
        if (this.elements.kamValue) {
            this.elements.kamValue.textContent = amount;
            
            // 当Kam值较高时(≥24)，添加高亮动画
            if (amount >= 24) {
                this.elements.kamValue.classList.add('high-value');
            } else {
                this.elements.kamValue.classList.remove('high-value');
            }
        }
        
        // 更新旧的公共池显示（如果存在）
        const poolEl = document.getElementById('publicPool');
        if (poolEl) {
            poolEl.textContent = `公共池: ${amount}`;
        }
    }

    updateScoresDisplay(scores) {
        // 更新所有玩家的积分显示
        for (let i = 0; i < 4; i++) {
            const scoreEl = document.getElementById(`pos${i}Score`);
            if (scoreEl) {
                scoreEl.textContent = `${scores[i]}分`;
            }
        }
    }

    handlePlayerOut(data) {
        const playerIndex = data.playerIndex;
        this.outPlayers[playerIndex] = true;
        
        // 添加OUT标记到玩家信息区域
        const playerInfoContainer = this.getPlayerInfoContainer(playerIndex);
        if (playerInfoContainer) {
            // 移除旧的OUT标记（如果存在）
            const oldOutBadge = playerInfoContainer.querySelector('.out-badge');
            if (oldOutBadge) {
                oldOutBadge.remove();
            }
            
            // 创建OUT标记
            const outBadge = document.createElement('div');
            outBadge.className = 'out-badge';
            outBadge.textContent = 'OUT';
            playerInfoContainer.appendChild(outBadge);
            
            // 添加动画效果
            setTimeout(() => {
                outBadge.classList.add('show');
            }, 10);
        }
        
        // 如果被OUT的是当前玩家，禁止出牌操作
        if (playerIndex === this.position) {
            this.updateControlButtons();
            this.showToast('最后一张牌且无栋数，已被OUT！', 3000);
        }
    }

    getPlayerInfoContainer(playerIndex) {
        const relativePos = (playerIndex - this.position + 4) % 4;
        if (relativePos === 0) {
            // 玩家自己 - 返回手牌区域
            return document.querySelector('.player-hand-section');
        } else {
            // 其他玩家 - 返回对应的play-zone
            return document.querySelector(`.player-play-zone[data-position="${playerIndex}"]`);
        }
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
