document.addEventListener('DOMContentLoaded', () => {
    const CONFIG = {
        COLORS: {
            CIRCLE: 'rgba(32, 33, 36, 0.05)',
            PIN: '#202124',
            FLYING_PIN: '#4285F4',
            POWER_UP: '#EA4335',
            SHIELD: 'rgba(66, 133, 244, 0.3)',
            SUCCESS: '#1E8E3E',
            SAFE_ZONE: 'rgba(30, 142, 62, 0.15)',
            DANGER: '#D93025'
        },
        PHYSICS: {
            PIN_LENGTH_RATIO: 0.12,
            PIN_HEAD_RADIUS_RATIO: 0.018,
            PIN_FLY_SPEED: 18,
            CIRCLE_SPEED_BASE: 0.004,
            CIRCLE_SPEED_INCREMENT: 0.0006,
            MAX_CIRCLE_SPEED: 0.018,
            COLLISION_THRESHOLD: 0.1
        },
        GAME: {
            INITIAL_PINS: 8,
            PIN_INCREMENT: 3,
            MAX_PINS: 25,
            SCORE_PER_PIN: 10,
            BONUS_MULTIPLIER: 2.5,
            POWER_UP_CHANCE: 0.25,
            POWER_UP_CHANCE_INCREMENT: 0.04,
            MAX_POWER_UP_CHANCE: 0.7,
            FOCUS_MODE_LEVEL: 5
        },
        POWER_UPS: {
            SLOW: { type: 'slow', duration: 500, color: '#FBBC05', icon: '⏱️' },
            SHIELD: { type: 'shield', duration: 1, color: '#4285F4', icon: '🛡️' },
            MULTIPLIER: { type: 'multiplier', duration: 400, color: '#EA4335', icon: '✨' }
        }
    };

    class AAGame {
        constructor() {
            this.canvas = document.getElementById('gameCanvas');
            this.ctx = this.canvas.getContext('2d');
            this.scoreValue = document.getElementById('scoreValue');
            this.levelValue = document.getElementById('levelValue');
            this.pinsRemaining = document.getElementById('pinsRemaining');
            this.highScoreValue = document.getElementById('highScoreValue');
            this.progressBar = document.getElementById('progressBar');
            this.finalScoreText = document.getElementById('finalScoreText');
            this.highScoreText = document.getElementById('highScoreText');
            this.pinsPlacedText = document.getElementById('pinsPlacedText');
            this.levelUpText = document.getElementById('levelUpText');
            this.powerUpIndicator = document.getElementById('powerUpIndicator');

            this.screens = {
                start: document.getElementById('startScreen'),
                gameOver: document.getElementById('gameOverScreen'),
                levelUp: document.getElementById('levelUpScreen'),
                settings: document.getElementById('settingsScreen'),
                tutorial: document.getElementById('tutorialScreen')
            };

            this.buttons = {
                start: document.getElementById('startButton'),
                restart: document.getElementById('restartButton'),
                menu: document.getElementById('menuButton'),
                continue: document.getElementById('continueButton'),
                settings: document.getElementById('settingsButton'),
                closeSettings: document.getElementById('closeSettingsButton'),
                tutorial: document.getElementById('tutorialButton'),
                backToMenu: document.getElementById('backToMenuButton')
            };

            this.soundManager = new SoundManager();
            this.state = 'ready';
            this.animationFrameId = null;
            this.lastTime = 0;
            this.score = 0;
            this.level = 1;
            this.highScore = 0;
            this.pinsPlaced = 0;
            this.activePowerUps = {};
            this.particles = [];
            this.pulseTimer = 0;

            this.settings = {
                sound: true,
                vibration: true
            };

            this.currentPin = null;
            this.pinsOnCircle = [];
            this.powerUpsOnCircle = [];
            this.circle = {
                angle: 0,
                speed: 0,
                direction: 1
            };

            this.init();
        }

        init() {
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
            window.addEventListener('orientationchange', () => this.resizeCanvas());
            this.setupEventListeners();
            this.loadSettings();
            this.showScreen('start');
            this.highScore = parseInt(localStorage.getItem('aaGameHighScore') || '0');
            this.highScoreValue.textContent = this.highScore;
        }

        resizeCanvas() {
            const size = Math.min(window.innerWidth, window.innerHeight) * 0.9;
            const dpr = window.devicePixelRatio || 1;
            this.canvas.style.width = `${size}px`;
            this.canvas.style.height = `${size}px`;
            this.canvas.width = size * dpr;
            this.canvas.height = size * dpr;
            this.ctx.scale(dpr, dpr);

            const logicalSize = size;
            this.center = { x: logicalSize / 2, y: logicalSize / 2 };
            this.circleRadius = logicalSize * 0.35;
            this.pinLength = logicalSize * CONFIG.PHYSICS.PIN_LENGTH_RATIO;
            this.pinHeadRadius = logicalSize * CONFIG.PHYSICS.PIN_HEAD_RADIUS_RATIO;

            if (this.state === 'ready' || this.state === 'playing') {
                this.draw();
            }
        }

        setupEventListeners() {
            this.buttons.start.addEventListener('click', () => this.startGame());
            this.buttons.restart.addEventListener('click', () => this.startGame());
            this.buttons.menu.addEventListener('click', () => this.showScreen('start'));
            this.buttons.continue.addEventListener('click', () => this.continueToNextLevel());
            this.buttons.settings.addEventListener('click', () => this.showScreen('settings'));
            this.buttons.closeSettings.addEventListener('click', () => this.hideSettings());
            this.buttons.tutorial.addEventListener('click', () => this.showScreen('tutorial'));
            this.buttons.backToMenu.addEventListener('click', () => this.showScreen('start'));

            document.getElementById('soundToggle').addEventListener('change', (e) => {
                this.settings.sound = e.target.checked;
                this.saveSettings();
            });

            document.getElementById('vibrationToggle').addEventListener('change', (e) => {
                this.settings.vibration = e.target.checked;
                this.saveSettings();
            });

            const shoot = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.state === 'playing' && this.currentPin && !this.currentPin.isFlying) {
                    this.shootPin();
                }
            };

            this.canvas.addEventListener('mousedown', shoot);
            this.canvas.addEventListener('touchstart', shoot, { passive: false });

            document.addEventListener('keydown', (e) => {
                if (e.code === 'Space' && this.state === 'playing' && this.currentPin && !this.currentPin.isFlying) {
                    this.shootPin();
                }
            });
        }

        async startGame() {
            await this.soundManager.unlockAudio();
            this.state = 'playing';
            this.score = 0;
            this.level = 1;
            this.pinsPlaced = 0;
            this.activePowerUps = {};
            this.particles = [];
            this.setupLevel();
            this.updateUI();
            this.showScreen(null);
            this.lastTime = performance.now();
            if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
        }

        setupLevel() {
            const levelIndex = Math.min(this.level - 1, 10);
            const pinCount = Math.min(
                CONFIG.GAME.INITIAL_PINS + levelIndex * CONFIG.GAME.PIN_INCREMENT,
                CONFIG.GAME.MAX_PINS
            );
            const circleSpeed = Math.min(
                CONFIG.PHYSICS.CIRCLE_SPEED_BASE + levelIndex * CONFIG.PHYSICS.CIRCLE_SPEED_INCREMENT,
                CONFIG.PHYSICS.MAX_CIRCLE_SPEED
            );
            const powerUpChance = Math.min(
                CONFIG.GAME.POWER_UP_CHANCE + levelIndex * CONFIG.GAME.POWER_UP_CHANCE_INCREMENT,
                CONFIG.GAME.MAX_POWER_UP_CHANCE
            );

            this.pinsToShoot = pinCount;
            this.maxPinsForLevel = pinCount;
            this.pinsOnCircle = [];
            this.powerUpsOnCircle = [];
            this.circle = {
                angle: Math.random() * Math.PI * 2,
                speed: circleSpeed,
                direction: Math.random() > 0.5 ? 1 : -1
            };

            if (Math.random() < powerUpChance) {
                this.spawnPowerUp();
            }

            this.spawnPin();
            this.updateUI();
        }

        spawnPowerUp() {
            const powerUpTypes = Object.values(CONFIG.POWER_UPS);
            const powerUp = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
            let angle;
            let isSafe = false;
            const maxAttempts = 10;
            let attempts = 0;

            while (!isSafe && attempts < maxAttempts) {
                angle = Math.random() * Math.PI * 2;
                isSafe = true;
                for (const pin of this.pinsOnCircle) {
                    let angleDiff = Math.abs(pin.angle - angle);
                    angleDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);
                    if (angleDiff < CONFIG.PHYSICS.COLLISION_THRESHOLD * 2) {
                        isSafe = false;
                        break;
                    }
                }
                attempts++;
            }

            if (isSafe) {
                this.powerUpsOnCircle.push({
                    angle: angle,
                    type: powerUp.type,
                    color: powerUp.color,
                    icon: powerUp.icon
                });
            }
        }

        spawnPin() {
            const logicalHeight = this.canvas.height / (window.devicePixelRatio || 1);
            this.currentPin = {
                y: logicalHeight - this.pinLength * 2,
                isFlying: false
            };
        }

        shootPin() {
            if (this.state !== 'playing' || !this.currentPin || this.currentPin.isFlying) return;
            this.currentPin.isFlying = true;
            if (this.settings.sound) this.soundManager.play('shoot');
            if (this.settings.vibration && navigator.vibrate) {
                navigator.vibrate(50);
            }
        }

        gameLoop(time) {
            if (this.state !== 'playing') return;
            const deltaTime = Math.min(2, (time - this.lastTime) / (1000 / 60));
            this.lastTime = time;
            this.update(deltaTime);
            this.draw();
            this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
        }

        update(deltaTime) {
            let speedMultiplier = this.activePowerUps.slow ? 0.5 : 1;
            this.circle.angle = (this.circle.angle + this.circle.speed * this.circle.direction * speedMultiplier * deltaTime) % (Math.PI * 2);

            if (this.currentPin && this.currentPin.isFlying) {
                this.currentPin.y -= CONFIG.PHYSICS.PIN_FLY_SPEED * deltaTime;
                this.checkCollision();
            }

            Object.keys(this.activePowerUps).forEach(key => {
                if (key !== 'shield') {
                    this.activePowerUps[key] -= deltaTime;
                    if (this.activePowerUps[key] <= 0) {
                        delete this.activePowerUps[key];
                        this.updatePowerUpDisplay();
                    }
                }
            });

            this.updateParticles(deltaTime);
            this.pulseTimer = Math.max(0, this.pulseTimer - deltaTime);
        }
        
        checkCollision() {
            if (!this.currentPin || !this.currentPin.isFlying) {
                return;
            }

            const pinHeadY = this.currentPin.y - this.pinLength;
            const distanceToCenter = this.center.y - pinHeadY;

            if (distanceToCenter >= this.circleRadius) {
                this.currentPin.isFlying = false;
                const newPinAngle = (1.5 * Math.PI - this.circle.angle + Math.PI * 2) % (Math.PI * 2);
                const threshold = CONFIG.PHYSICS.COLLISION_THRESHOLD;

                for (const pin of this.pinsOnCircle) {
                    let angleDiff = Math.abs(newPinAngle - pin.angle);
                    angleDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);

                    if (angleDiff < threshold) {
                        if (this.activePowerUps.shield) {
                            console.log('Shield activated, collision ignored');
                            if (this.settings.sound) this.soundManager.play('hit');
                            this.createParticles(this.center.x, this.center.y - this.circleRadius, CONFIG.POWER_UPS.SHIELD.color, 30);

                            delete this.activePowerUps.shield;
                            this.updatePowerUpDisplay();

                            this.currentPin = null;
                            this.pinsPlaced++;
                            this.pinsToShoot--;

                            if (this.pinsToShoot === 0) {
                                this.levelUp();
                            } else {
                                this.spawnPin();
                            }
                            this.updateUI();
                            return;
                        } else {
                            console.log('Collision detected, game over');
                            this.createParticles(
                                this.center.x,
                                this.center.y - this.circleRadius,
                                CONFIG.COLORS.DANGER,
                                50
                            );
                            this.gameOver();
                            return;
                        }
                    }
                }
                this.placePin(newPinAngle);
            }
        }


        placePin(newPinAngle) {
            this.powerUpsOnCircle = this.powerUpsOnCircle.filter(powerUp => {
                let powerUpAngle = (powerUp.angle) % (Math.PI * 2);
                let angleDiff = Math.abs(powerUpAngle - newPinAngle);
                angleDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);

                if (angleDiff < CONFIG.PHYSICS.COLLISION_THRESHOLD) {
                    this.activatePowerUp(powerUp.type, powerUp.color, powerUp.icon);
                    this.createParticles(
                        this.center.x + Math.cos(powerUp.angle + this.circle.angle) * this.circleRadius,
                        this.center.y + Math.sin(powerUp.angle + this.circle.angle) * this.circleRadius,
                        powerUp.color,
                        20
                    );
                    return false;
                }
                return true;
            });

            if (this.settings.sound) this.soundManager.play('hit');
            this.pinsOnCircle.push({ angle: newPinAngle });
            this.pinsPlaced++;
            this.pulseTimer = 12;
            const scoreMultiplier = this.activePowerUps.multiplier ? CONFIG.GAME.BONUS_MULTIPLIER : 1;
            this.score += Math.floor(CONFIG.GAME.SCORE_PER_PIN * scoreMultiplier);
            this.pinsToShoot--;
            this.currentPin = null;

            if (this.pinsToShoot === 0) {
                this.levelUp();
            } else {
                this.spawnPin();
                if (Math.random() < CONFIG.GAME.POWER_UP_CHANCE) {
                    this.spawnPowerUp();
                }
            }

            this.updateUI();
        }

        activatePowerUp(type, color, icon) {
            if (this.settings.sound) this.soundManager.play('powerUp');
            const powerUpConfig = Object.values(CONFIG.POWER_UPS).find(p => p.type === type);
            this.activePowerUps[type] = powerUpConfig.duration;
            this.updatePowerUpDisplay();
            this.createParticles(this.center.x, this.center.y, color, 30);
        }

        updatePowerUpDisplay() {
            this.powerUpIndicator.innerHTML = '';
            Object.keys(this.activePowerUps).forEach(key => {
                const powerUp = Object.values(CONFIG.POWER_UPS).find(p => p.type === key);
                if (!powerUp) return;

                const badge = document.createElement('div');
                badge.className = 'powerUpBadge';
                badge.textContent = powerUp.icon;
                badge.style.background = powerUp.color;
                badge.style.color = 'white';
                this.powerUpIndicator.appendChild(badge);
                setTimeout(() => badge.classList.add('active'), 10);
            });
        }

        createParticles(x, y, color, count = 15) {
            for (let i = 0; i < count; i++) {
                this.particles.push({
                    x: x,
                    y: y,
                    size: Math.random() * 5 + 2,
                    color: color,
                    speedX: (Math.random() - 0.5) * 6,
                    speedY: (Math.random() - 0.5) * 6,
                    life: 40 + Math.random() * 20
                });
            }
        }

        updateParticles(deltaTime) {
            this.particles = this.particles.filter(p => {
                p.x += p.speedX * deltaTime;
                p.y += p.speedY * deltaTime;
                p.life -= deltaTime;
                return p.life > 0;
            });
        }

        levelUp() {
            this.state = 'levelup';
            cancelAnimationFrame(this.animationFrameId);
            if (this.settings.sound) this.soundManager.play('levelUp');
            if (this.settings.vibration && navigator.vibrate) {
                navigator.vibrate([100, 50, 100]);
            }
            this.levelUpText.textContent = `Level ${this.level + 1}`;
            this.showScreen('levelUp');
        }

        continueToNextLevel() {
            this.level++;
            this.setupLevel();
            this.showScreen(null);
            this.state = 'playing';
            this.lastTime = performance.now();
            this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
        }

        gameOver() {
            this.state = 'ended';
            cancelAnimationFrame(this.animationFrameId);
            if (this.settings.sound) this.soundManager.play('gameOver');
            if (this.settings.vibration && navigator.vibrate) {
                navigator.vibrate([200, 100, 200]);
            }
            if (this.score > this.highScore) {
                this.highScore = this.score;
                localStorage.setItem('aaGameHighScore', this.highScore);
            }
            this.finalScoreText.textContent = `Score: ${this.score}`;
            this.highScoreText.textContent = `High Score: ${this.highScore}`;
            this.pinsPlacedText.textContent = `Pins Placed: ${this.pinsPlaced}`;
            this.showScreen('gameOver');
        }

        draw() {
            const logicalWidth = this.canvas.width / (window.devicePixelRatio || 1);
            const logicalHeight = this.canvas.height / (window.devicePixelRatio || 1);
            this.ctx.clearRect(0, 0, logicalWidth, logicalHeight);

            this.drawSafeZones();

            this.ctx.beginPath();
            const pulseScale = this.pulseTimer > 0 ? 1 + 0.05 * Math.sin(this.pulseTimer * 0.5) : 1;
            this.ctx.arc(this.center.x, this.center.y, this.circleRadius * pulseScale, 0, Math.PI * 2);
            this.ctx.fillStyle = CONFIG.COLORS.CIRCLE;
            this.ctx.fill();
            this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            this.ctx.shadowBlur = 8;
            this.ctx.stroke();
            this.ctx.shadowBlur = 0;

            this.powerUpsOnCircle.forEach(powerUp => {
                const angle = powerUp.angle + this.circle.angle;
                const x = this.center.x + Math.cos(angle) * this.circleRadius;
                const y = this.center.y + Math.sin(angle) * this.circleRadius;

                this.ctx.beginPath();
                this.ctx.arc(x, y, this.pinHeadRadius * 1.5, 0, Math.PI * 2);
                this.ctx.fillStyle = powerUp.color;
                this.ctx.fill();

                this.ctx.font = `${this.pinHeadRadius * 2}px Arial`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillStyle = 'white';
                this.ctx.fillText(powerUp.icon, x, y);
            });

            this.pinsOnCircle.forEach(pin => {
                this.drawPin(pin.angle);
            });

            if (this.currentPin) {
                this.drawPin(null, this.currentPin.y, this.currentPin.isFlying);
            }

            if (this.activePowerUps.shield) {
                this.ctx.beginPath();
                this.ctx.arc(this.center.x, this.center.y, this.circleRadius + 10, 0, Math.PI * 2);
                this.ctx.strokeStyle = CONFIG.POWER_UPS.SHIELD.color;
                this.ctx.lineWidth = 4;
                this.ctx.stroke();
            }

            this.drawParticles();
        }

        drawSafeZones() {
            const threshold = CONFIG.PHYSICS.COLLISION_THRESHOLD * 2;
            this.ctx.strokeStyle = CONFIG.COLORS.SAFE_ZONE;
            this.ctx.lineWidth = 4;
            this.ctx.globalAlpha = 0.3;
            this.ctx.shadowColor = CONFIG.COLORS.SUCCESS;
            this.ctx.shadowBlur = 6;

            this.pinsOnCircle.forEach(pin => {
                const pinAngle = (pin.angle + this.circle.angle) % (Math.PI * 2);
                this.ctx.beginPath();
                this.ctx.arc(this.center.x, this.center.y, this.circleRadius, pinAngle - threshold, pinAngle + threshold);
                this.ctx.stroke();
            });

            this.ctx.globalAlpha = 1;
            this.ctx.shadowBlur = 0;
        }

        drawPin(angle, yPos, isFlying = false) {
            let headX, headY, tailX, tailY;

            if (angle !== null) {
                const totalAngle = (angle + this.circle.angle) % (Math.PI * 2);
                headX = this.center.x + Math.cos(totalAngle) * this.circleRadius;
                headY = this.center.y + Math.sin(totalAngle) * this.circleRadius;
                tailX = this.center.x + Math.cos(totalAngle) * (this.circleRadius + this.pinLength);
                tailY = this.center.y + Math.sin(totalAngle) * (this.circleRadius + this.pinLength);
            } else {
                headX = this.center.x;
                tailX = this.center.x;
                headY = yPos - this.pinLength;
                tailY = yPos;
            }

            this.ctx.strokeStyle = isFlying ? CONFIG.COLORS.FLYING_PIN : CONFIG.COLORS.PIN;
            this.ctx.lineWidth = isFlying ? 3 : 2;
            this.ctx.lineCap = 'round';
            this.ctx.beginPath();
            this.ctx.moveTo(tailX, tailY);
            this.ctx.lineTo(headX, headY);
            this.ctx.stroke();

            this.ctx.fillStyle = isFlying ? CONFIG.COLORS.FLYING_PIN : CONFIG.COLORS.PIN;
            this.ctx.beginPath();
            this.ctx.arc(headX, headY, this.pinHeadRadius, 0, Math.PI * 2);
            this.ctx.fill();
        }

        drawParticles() {
            this.particles.forEach(p => {
                this.ctx.globalAlpha = p.life / 60;
                this.ctx.fillStyle = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            });
            this.ctx.globalAlpha = 1;
        }

        updateUI() {
            this.scoreValue.textContent = this.score;
            this.levelValue.textContent = this.level;
            this.pinsRemaining.textContent = this.pinsToShoot;
            this.highScoreValue.textContent = this.highScore;
            this.progressBar.style.width = `${((this.maxPinsForLevel - this.pinsToShoot) / this.maxPinsForLevel) * 100}%`;
        }

        showScreen(screenName) {
            Object.values(this.screens).forEach(screen => {
                screen.classList.remove('active');
            });

            const isGameActive = !screenName;
            document.getElementById('uiOverlay').style.display = isGameActive ? 'flex' : 'none';
            document.getElementById('progressContainer').style.display = isGameActive ? 'block' : 'none';
            document.getElementById('powerUpIndicator').style.display = isGameActive ? 'flex' : 'none';
            document.getElementById('settingsButton').style.display = isGameActive ? 'flex' : 'none';

            if (screenName && this.screens[screenName]) {
                this.screens[screenName].classList.add('active');
            }
        }

        hideSettings() {
            this.showScreen(null);
        }

        loadSettings() {
            const savedSettings = localStorage.getItem('aaGameSettings');
            if (savedSettings) {
                this.settings = JSON.parse(savedSettings);
                document.getElementById('soundToggle').checked = this.settings.sound;
                document.getElementById('vibrationToggle').checked = this.settings.vibration;
            }
        }

        saveSettings() {
            localStorage.setItem('aaGameSettings', JSON.stringify(this.settings));
        }
    }

    class SoundManager {
        constructor() {
            this.isUnlocked = false;
            this.synths = {};
        }

        async unlockAudio() {
            if (this.isUnlocked || typeof Tone === 'undefined') return;
            try {
                await Tone.start();
                this.synths = {
                    shoot: new Tone.PluckSynth({ attackNoise: 0.5, dampening: 4000, resonance: 0.7 }).toDestination(),
                    hit: new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 2, envelope: { attack: 0.001, decay: 0.2, sustain: 0.01, release: 0.2 } }).toDestination(),
                    gameOver: new Tone.FMSynth({ harmonicity: 3, modulationIndex: 10 }).toDestination(),
                    powerUp: new Tone.Synth({ oscillator: { type: "triangle" } }).toDestination(),
                    levelUp: new Tone.PolySynth(Tone.Synth).toDestination()
                };
                this.isUnlocked = true;
            } catch(e) {
                console.error("Audio engine failed to start:", e);
            }
        }

        play(sound) {
            if (!this.isUnlocked) return;
            try {
                const now = Tone.now();
                switch(sound) {
                    case 'shoot': this.synths.shoot.triggerAttackRelease("C5", "8n", now); break;
                    case 'hit': this.synths.hit.triggerAttackRelease("C2", "8n", now); break;
                    case 'gameOver': this.synths.gameOver.triggerAttackRelease("C2", "1n", now); break;
                    case 'powerUp': this.synths.powerUp.triggerAttackRelease("G5", "16n", now); break;
                    case 'levelUp': this.synths.levelUp.triggerAttackRelease(["C4", "E4", "G4"], "8n", now); break;
                }
            } catch(e) {
                console.error("Failed to play sound:", e);
            }
        }
    }

    new AAGame();
});
