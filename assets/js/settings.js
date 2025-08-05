// Global settings object that the main game script will use
let gameSettings = {
    sound: true,
    vibration: true,
    theme: 'light',
    pinColor: 'default' // Added pin color setting
};

// --- Sound Manager Class ---
class SoundManager {
    constructor() { this.isUnlocked = false; this.synths = {}; }
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
        } catch (e) { console.error("Audio engine failed to start:", e); }
    }
    play(sound) {
        if (!this.isUnlocked || !gameSettings.sound) return;
        try {
            const now = Tone.now();
            switch (sound) {
                case 'shoot': this.synths.shoot.triggerAttackRelease("C5", "8n", now); break;
                case 'hit': this.synths.hit.triggerAttackRelease("C2", "8n", now); break;
                case 'gameOver': this.synths.gameOver.triggerAttackRelease("C2", "1n", now); break;
                case 'powerUp': this.synths.powerUp.triggerAttackRelease("G5", "16n", now); break;
                case 'levelUp': this.synths.levelUp.triggerAttackRelease(["C4", "E4", "G4"], "8n", now); break;
            }
        } catch (e) { console.error(`Failed to play sound: ${sound}`, e); }
    }
}

// --- Settings Management Functions ---
function saveSettings() {
    localStorage.setItem('aaGameSettings', JSON.stringify(gameSettings));
}

function loadSettings() {
    const savedSettings = localStorage.getItem('aaGameSettings');
    if (savedSettings) {
        // Merge saved settings with defaults to avoid errors if new settings are added
        const loaded = JSON.parse(savedSettings);
        gameSettings = {...gameSettings, ...loaded};
    }
    // Apply settings to the UI
    document.getElementById('soundToggle').checked = gameSettings.sound;
    document.getElementById('vibrationToggle').checked = gameSettings.vibration;
    document.getElementById('themeSelector').value = gameSettings.theme;
    document.getElementById('pinColorSelector').value = gameSettings.pinColor;
    applyTheme(gameSettings.theme);
}

function applyTheme(theme) {
    document.body.classList.toggle('dark-theme', theme === 'dark');
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();

    document.getElementById('themeSelector').addEventListener('change', (e) => {
        gameSettings.theme = e.target.value;
        applyTheme(gameSettings.theme);
        saveSettings();
    });
    
    document.getElementById('pinColorSelector').addEventListener('change', (e) => {
        gameSettings.pinColor = e.target.value;
        saveSettings();
    });

    document.getElementById('soundToggle').addEventListener('change', (e) => {
        gameSettings.sound = e.target.checked;
        saveSettings();
    });

    document.getElementById('vibrationToggle').addEventListener('change', (e) => {
        gameSettings.vibration = e.target.checked;
        saveSettings();
    });
});
