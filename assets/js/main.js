document.addEventListener('DOMContentLoaded', () => {
    // This object holds all the static configuration for the game.
    const CONFIG = {
        COLORS: {
            CIRCLE_LIGHT: 'rgba(32, 33, 36, 0.05)',
            CIRCLE_DARK: 'rgba(255, 255, 255, 0.05)',
            PIN_TEXT: '#FFFFFF',
            FLYING_PIN: '#4285F4',
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
            MAX_POWER_UP_CHANCE: 0.7
        }
    };

    class AAGame {
        constructor() {
            // --- DOM Element Selection ---
            this.canvas = document.getElementById('gameCanvas');
            this.ctx = this.canvas.getContext('2d');
            this.scoreValue = document.getElementById('scoreValue');
            this.levelValue = document.getElementById('levelValue');
            this.highScoreValue = document.getElementById('highScoreValue');
            this.progressBar = document.getElementById('progressBar');
            this.finalScoreText = document.getElementById('finalScoreText');
            this.highScoreText = document.getElementById('highScoreText');
            this.pinsPlacedText = document.getElementById('pinsPlacedText');
            this.levelUpText = document.getElementById('levelUpText');
            this.powerUpIndicator = document.getElementById('powerUpIndicator');
            this.menuHighScoreValue = document.getElementById('menuHighScoreValue');

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
                settings: document.getElementById('menuSettingsButton'),
                closeSettings: document.getElementById('closeSettingsButton'),
                tutorial: document.getElementById('tutorialButton'),
                backToMenu: document.getElementById('backToMenuButton')
            };
            
            // --- Game State Initialization ---
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
            this.currentPin = null;
            this.pinsOnCircle = [];
            this.powerUpsOnCircle = [];
            this.circle = { angle: 0, speed: 0, direction: 1 };

            this.init();
        }

        /** Initializes the game, resizes canvas, sets up listeners, and shows the start screen. */
        init() {
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
            window.addEventListener('orientationchange', () => this.resizeCanvas());
            this.setupEventListeners();
            this.showScreen('start');
            this.highScore = parseInt(localStorage.getItem('aaGameHighScore') || '0');
            this.highScoreValue.textContent = this.highScore;
            this.menuHighScoreValue.textContent = `Your High Score: ${this.highScore}`;
        }

        /** Resizes the canvas to fit the screen while maintaining aspect ratio. */
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

            if (this.state !== 'playing') {
                this.draw();
            }
        }

        /** Sets up all the event listeners for buttons and game input. */
        setupEventListeners() {
            this.buttons.start.addEventListener('click', () => this.startGame());
            this.buttons.restart.addEventListener('click', () => this.startGame());
            this.buttons.menu.addEventListener('click', () => this.showScreen('start'));
            this.buttons.continue.addEventListener('click', () => this.continueToNextLevel());
            this.buttons.settings.addEventListener('click', () => this.showScreen('settings'));
            this.buttons.closeSettings.addEventListener('click', () => this.hideSettings());
            this.buttons.tutorial.addEventListener('click', () => this.showScreen('tutorial'));
            this.buttons.backToMenu.addEventListener('click', () => this.showScreen('start'));

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

        /** Starts a new game session. */
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

        /** Sets up the parameters for the current level. */
        setupLevel() {
            const levelIndex = Math.min(this.level - 1, 10);
            const pinCount = Math.min(CONFIG.GAME.INITIAL_PINS + levelIndex * CONFIG.GAME.PIN_INCREMENT, CONFIG.GAME.MAX_PINS);
            const circleSpeed = Math.min(CONFIG.PHYSICS.CIRCLE_SPEED_BASE + levelIndex * CONFIG.PHYSICS.CIRCLE_SPEED_INCREMENT, CONFIG.PHYSICS.MAX_CIRCLE_SPEED);
            const powerUpChance = Math.min(CONFIG.GAME.POWER_UP_CHANCE + levelIndex * CONFIG.GAME.POWER_UP_CHANCE_INCREMENT, CONFIG.GAME.MAX_POWER_UP_CHANCE);

            this.pinsToShoot = pinCount;
            this.maxPinsForLevel = pinCount;
            this.pinsOnCircle = [];
            this.powerUpsOnCircle = [];
            this.circle = { angle: Math.random() * Math.PI * 2, speed: circleSpeed, direction: Math.random() > 0.5 ? 1 : -1 };

            if (Math.random() < powerUpChance) this.spawnPowerUp();
            this.spawnPin();
            this.updateUI();
        }

        /** Spawns a random power-up on the circle. */
        spawnPowerUp() {
            const powerUpTypes = Object.values(GAME_SKILLS);
            const powerUp = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
            let angle, isSafe = false, attempts = 0;
            while (!isSafe && attempts < 10) {
                angle = Math.random() * Math.PI * 2;
                isSafe = this.pinsOnCircle.every(pin => {
                    let angleDiff = Math.abs(pin.angle - angle);
                    angleDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);
                    return angleDiff >= CONFIG.PHYSICS.COLLISION_THRESHOLD * 2;
                });
                attempts++;
            }
            if (isSafe) this.powerUpsOnCircle.push({ angle: angle, type: powerUp.type, icon: powerUp.icon });
        }

        /** Creates a new pin ready to be shot. */
        spawnPin() {
            const logicalHeight = this.canvas.height / (window.devicePixelRatio || 1);
            this.currentPin = { y: logicalHeight - this.pinLength * 2.5, isFlying: false };
        }

        /** Shoots the current pin. */
        shootPin() {
            if (this.state !== 'playing' || !this.currentPin || this.currentPin.isFlying) return;
            this.currentPin.isFlying = true;
            this.soundManager.play('shoot');
            if (gameSettings.vibration && navigator.vibrate) navigator.vibrate(50);
        }

        /** The main game loop, called every frame. */
        gameLoop(time) {
            if (this.state !== 'playing') return;
            const deltaTime = Math.min(2, (time - this.lastTime) / (1000 / 60));
            this.lastTime = time;
            this.update(deltaTime);
            this.draw();
            this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
        }

        /** Updates the game state for the current frame. */
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
        
        /** Checks for collisions between the flying pin and the circle/other pins. */
        checkCollision() {
            if (!this.currentPin || !this.currentPin.isFlying) return;
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
                            this.soundManager.play('hit');
                            this.createParticles(this.center.x, this.center.y - this.circleRadius, GAME_SKILLS.SHIELD.color, 30);
                            delete this.activePowerUps.shield;
                            this.updatePowerUpDisplay();
                            this.currentPin = null;
                            this.pinsPlaced++;
                            this.pinsToShoot--;
                            if (this.pinsToShoot === 0) { this.levelUp(); } else { this.spawnPin(); }
                            this.updateUI();
                            return;
                        } else {
                            this.createParticles(this.center.x, this.center.y - this.circleRadius, CONFIG.COLORS.DANGER, 50);
                            this.gameOver();
                            return;
                        }
                    }
                }
                this.placePin(newPinAngle);
            }
        }

        /** Places a pin on the circle after a successful shot. */
        placePin(newPinAngle) {
            this.powerUpsOnCircle = this.powerUpsOnCircle.filter(powerUp => {
                let angleDiff = Math.abs(powerUp.angle - newPinAngle);
                angleDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);
                if (angleDiff < CONFIG.PHYSICS.COLLISION_THRESHOLD) {
                    this.activatePowerUp(powerUp.type);
                    return false;
                }
                return true;
            });

            this.soundManager.play('hit');
            this.pinsOnCircle.push({ angle: newPinAngle, number: this.pinsToShoot });
            this.pinsPlaced++;
            this.pulseTimer = 12;
            const scoreMultiplier = this.activePowerUps.multiplier ? CONFIG.GAME.BONUS_MULTIPLIER : 1;
            this.score += Math.floor(CONFIG.GAME.SCORE_PER_PIN * scoreMultiplier);
            this.pinsToShoot--;
            this.currentPin = null;

            if (this.pinsToShoot === 0) { this.levelUp(); } else { this.spawnPin(); }
            this.updateUI();
        }

        /** Activates a collected power-up. */
        activatePowerUp(type) {
            this.soundManager.play('powerUp');
            const powerUpConfig = Object.values(GAME_SKILLS).find(p => p.type === type);
            if (powerUpConfig) {
                this.activePowerUps[type] = powerUpConfig.duration;
                this.updatePowerUpDisplay();
                this.createParticles(this.center.x, this.center.y, powerUpConfig.color, 30);
            }
        }

        /** Updates the power-up indicator UI. */
        updatePowerUpDisplay() {
            this.powerUpIndicator.innerHTML = '';
            Object.keys(this.activePowerUps).forEach(key => {
                const powerUp = Object.values(GAME_SKILLS).find(p => p.type === key);
                if (!powerUp) return;
                const badge = document.createElement('div');
                badge.className = 'powerUpBadge active';
                badge.textContent = powerUp.icon;
                badge.style.background = powerUp.color;
                badge.style.color = 'white';
                this.powerUpIndicator.appendChild(badge);
            });
        }

        /** Creates particle effects. */
        createParticles(x, y, color, count = 15) {
            for (let i = 0; i < count; i++) {
                this.particles.push({ x, y, size: Math.random() * 5 + 2, color, speedX: (Math.random() - 0.5) * 6, speedY: (Math.random() - 0.5) * 6, life: 40 + Math.random() * 20 });
            }
        }

        /** Updates the position and lifetime of particles. */
        updateParticles(deltaTime) {
            this.particles = this.particles.filter(p => {
                p.x += p.speedX * deltaTime;
                p.y += p.speedY * deltaTime;
                p.life -= deltaTime;
                return p.life > 0;
            });
        }

        /** Handles the level-up sequence. */
        levelUp() {
            this.state = 'levelup';
            cancelAnimationFrame(this.animationFrameId);
            this.soundManager.play('levelUp');
            if (gameSettings.vibration) navigator.vibrate?.([100, 50, 100]);
            this.levelUpText.textContent = `Level ${this.level + 1}`;
            this.showScreen('levelUp');
        }

        /** Continues to the next level. */
        continueToNextLevel() {
            this.level++;
            this.setupLevel();
            this.showScreen(null);
            this.state = 'playing';
            this.lastTime = performance.now();
            this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
        }

        /** Handles the game-over sequence. */
        gameOver() {
            this.state = 'ended';
            cancelAnimationFrame(this.animationFrameId);
            this.soundManager.play('gameOver');
            if (gameSettings.vibration) navigator.vibrate?.([200, 100, 200]);
            if (this.score > this.highScore) {
                this.highScore = this.score;
                localStorage.setItem('aaGameHighScore', this.highScore);
            }
            this.finalScoreText.textContent = `Score: ${this.score}`;
            this.highScoreText.textContent = `High Score: ${this.highScore}`;
            this.pinsPlacedText.textContent = `Pins Placed: ${this.pinsPlaced}`;
            this.showScreen('gameOver');
        }

        /** Draws the entire game scene. */
        draw() {
            const logicalWidth = this.canvas.width / (window.devicePixelRatio || 1);
            const logicalHeight = this.canvas.height / (window.devicePixelRatio || 1);
            this.ctx.clearRect(0, 0, logicalWidth, logicalHeight);
            
            this.ctx.beginPath();
            const pulseScale = this.pulseTimer > 0 ? 1 + 0.05 * Math.sin(this.pulseTimer * 0.5) : 1;
            this.ctx.arc(this.center.x, this.center.y, this.circleRadius * pulseScale, 0, Math.PI * 2);
            this.ctx.fillStyle = gameSettings.theme === 'dark' ? CONFIG.COLORS.CIRCLE_DARK : CONFIG.COLORS.CIRCLE_LIGHT;
            this.ctx.fill();
            
            this.pinsOnCircle.forEach(pin => this.drawPin(pin.angle, null, false, pin.number));
            this.powerUpsOnCircle.forEach(p => this.drawPowerUpOnCircle(p));
            if (this.currentPin) this.drawPin(null, this.currentPin.y, this.currentPin.isFlying, this.pinsToShoot);
            
            if (this.activePowerUps.shield) {
                this.ctx.beginPath();
                this.ctx.arc(this.center.x, this.center.y, this.circleRadius + 10, 0, Math.PI * 2);
                this.ctx.strokeStyle = GAME_SKILLS.SHIELD.color;
                this.ctx.lineWidth = 4;
                this.ctx.stroke();
            }
            this.drawParticles();
        }

        /** Draws a single pin or a power-up icon. */
        drawPin(angle, yPos, isFlying = false, number = null) {
            let headX, headY, tailX, tailY;
            const pinColor = getComputedStyle(document.documentElement).getPropertyValue(`--pin-color-${gameSettings.pinColor}`).trim();

            if (angle !== null) {
                const totalAngle = (angle + this.circle.angle) % (Math.PI * 2);
                headX = this.center.x + Math.cos(totalAngle) * this.circleRadius;
                headY = this.center.y + Math.sin(totalAngle) * this.circleRadius;
                tailX = this.center.x + Math.cos(totalAngle) * (this.circleRadius + this.pinLength);
                tailY = this.center.y + Math.sin(totalAngle) * (this.circleRadius + this.pinLength);
            } else {
                headX = this.center.x; tailX = this.center.x;
                headY = yPos - this.pinLength; tailY = yPos;
            }

            this.ctx.strokeStyle = isFlying ? CONFIG.COLORS.FLYING_PIN : pinColor;
            this.ctx.lineWidth = 2.5;
            this.ctx.lineCap = 'round';
            this.ctx.beginPath();
            this.ctx.moveTo(tailX, tailY);
            this.ctx.lineTo(headX, headY);
            this.ctx.stroke();

            this.ctx.fillStyle = isFlying ? CONFIG.COLORS.FLYING_PIN : pinColor;
            this.ctx.beginPath();
            this.ctx.arc(headX, headY, this.pinHeadRadius, 0, Math.PI * 2);
            this.ctx.fill();

            if (number !== null && number > 0) {
                this.ctx.fillStyle = CONFIG.COLORS.PIN_TEXT;
                this.ctx.font = `bold ${this.pinHeadRadius * 1.1}px Roboto`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(number, headX, headY + 1);
            }
        }
        
        /** Draws a power-up icon directly on the circle. */
        drawPowerUpOnCircle(powerUp) {
            const angle = (powerUp.angle + this.circle.angle) % (Math.PI * 2);
            const x = this.center.x + Math.cos(angle) * this.circleRadius;
            const y = this.center.y + Math.sin(angle) * this.circleRadius;
            
            this.ctx.font = `${this.pinHeadRadius * 2.5}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(powerUp.icon, x, y);
        }

        /** Draws all active particles. */
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

        /** Updates the UI elements like score and level. */
        updateUI() {
            this.scoreValue.textContent = this.score;
            this.levelValue.textContent = this.level;
            this.highScoreValue.textContent = this.highScore;
            this.progressBar.style.width = `${((this.maxPinsForLevel - this.pinsToShoot) / this.maxPinsForLevel) * 100}%`;
        }

        /** Shows a specific screen (e.g., 'start', 'gameOver') and hides others. */
        showScreen(screenName) {
            Object.values(this.screens).forEach(screen => screen.classList.remove('active'));
            const isGameActive = !screenName;
            document.getElementById('uiOverlay').style.display = isGameActive ? 'flex' : 'none';
            document.getElementById('progressContainer').style.display = isGameActive ? 'block' : 'none';
            document.getElementById('powerUpIndicator').style.display = isGameActive ? 'flex' : 'none';
            
            if (screenName && this.screens[screenName]) {
                this.screens[screenName].classList.add('active');
            }
            if (screenName === 'start') {
                this.highScore = parseInt(localStorage.getItem('aaGameHighScore') || '0');
                this.menuHighScoreValue.textContent = `Your High Score: ${this.highScore}`;
            }
        }

        /** Hides the settings screen and returns to the start menu. */
        hideSettings() {
            this.showScreen('start');
        }
    }
    
    new AAGame();
});
