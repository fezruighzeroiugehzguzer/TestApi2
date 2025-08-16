// =========== SUBX GAME LOGIC - version API, pas de dictionnaire dans le JS ============

// Variables globales
let WORDS = []; // Optionnel, utilisé seulement pour l'import custom
let subsIndex = {}, allSubs = [];
let currentMode = "subX", difficulty = 1, speedrunCount = 10;
let setOfSubs = [], currentIndex = 0;
let currentSub = null, currentMots = [];
let startTime = 0, timerInterval = null;
let history = [];
let sessionScore = 0, bestTime = null, partieTerminee = false;
let keepPlayingSub50 = false;

// --- skip logic
let skipBinding = false;
let skipKey = null;
let skippedSyllabes = [];
let lastSkipHTML = ""; // Pour garder la réponse du dernier skip

const $ = s => document.querySelector(s);

// ====== THEMES ET LANGUES ======
const THEMES = {
    "classic": { accent: "#0069ff", bg: "#f8f8ff", text: "#222", accent2: "#ff0066", success: "#00b65c", danger: "#d90000", fg: "#222" },
    "rose":    { accent: "#ff0066", bg: "#fff0fa", text: "#222", accent2: "#0069ff", success: "#00b65c", danger: "#d90000", fg: "#222" },
    "vert":    { accent: "#00b65c", bg: "#f7fff0", text: "#222", accent2: "#0069ff", success: "#ff0066", danger: "#d90000", fg: "#222" }
};

const LANGUAGES = {
    "fr": {
        name: "Français",
        placeholder: "Entrez un mot...",
        rules: "Tapez un mot contenant la syllabe affichée.",
        subs: "Syllabes",
        words: "Mots",
        score: "Score",
        time: "Temps",
        noneList: "Aucune syllabe trouvée",
        change: "Change le mode/difficulté ou ta liste de mots.",
        syllabe: "Syllabe",
        feedback: {
            correct: "Bien joué !",
            already: "Mot déjà trouvé.",
            short: "Mot trop court.",
            notfound: "Mot non trouvé dans le dictionnaire.",
            missing: "La syllabe n'est pas présente dans ce mot.",
            empty: "Veuillez entrer un mot."
        },
        terminee: "Bravo ! Partie terminée 🎉",
        found: "Mot trouvé :",
        none: "Mot incorrect ou absent !",
        reponses: "Réponses pour",
        botw: "Quelques mots pour",
        botnone: "Aucun mot trouvé pour",
        bothelp: "Utilisez /c <syllabe> pour chercher des mots.",
        botex: "Exemple : /c an",
        botdesc: "Je peux te donner des mots pour une syllabe !",
        botmore: "+{n} autres mots",
        noHist: "Pas d'historique",
        casual_lives: "vies restantes",
        casual_life: "vie restante",
        casual_stats: "Statistiques",
        casual_lost: "Syllabes perdues",
        casual_deadsylls: "Syllabes mortes",
        subs: "Syllabes",
        words: "Mots",
    }
};

let currentLang = "fr";
let currentTheme = "classic";

function t(key, vars={}) {
    let str = LANGUAGES[currentLang][key] ?? key;
    for (const k in vars) str = str.replaceAll("{"+k+"}",vars[k]);
    return str;
}
function setTheme(theme) {
    const t = THEMES[theme] || THEMES.classic;
    Object.keys(t).forEach(k => document.documentElement.style.setProperty('--'+k, t[k]));
}
function setLang(lang) {
    currentLang = lang;
    $("#guess-input").placeholder = LANGUAGES[lang].placeholder;
    $("#rules").textContent = LANGUAGES[lang].rules;
}

// ================= SYLLABES ===================
// On retire la liste locale des mots, la recherche se fait via l'API

function removeDiacritics(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
}

// Utilise l'API pour récupérer les mots contenant une syllabe
function getWordsFromAPI(syllabe, callback) {
    fetch(`/api/find-words?syll=${encodeURIComponent(syllabe)}`)
      .then(r => r.json())
      .then(data => callback(data.mots || []));
}

// *** MODIFICATION PRINCIPALE ***
// Utilise l'API pour récupérer dynamiquement le pool de syllabes
function getSyllablesPool(lang="fr", callback) {
    fetch('/api/syllabes')
      .then(r => r.json())
      .then(data => callback(data.syllabes || []));
}

// ========== UI & INTERACTIONS ==========

function showStats() {
    $("#total-subs").textContent = `${t("subs")}: ?`;
    $("#total-mots").textContent = `${t("words")}: ?`;
    $("#session-score").textContent = `${t("score")}: ${sessionScore}`;
    $("#syllabes-pour-sub").textContent = "";
}

function updateProgress() {
    $("#progress-bar").innerHTML = "";
    $("#remaining-box").textContent = "";
    if (currentMode === "subX" || currentMode === "speedrun") {
        $("#set-progress").textContent = setOfSubs.length > 1 ?
            `Progression : ${currentIndex + 1}/${setOfSubs.length} syllabes` : "";
    } else {
        $("#set-progress").textContent = "";
    }
}

function pickSubs(mode, callback) {
    getSyllablesPool(currentLang, syllabes => {
        let subs = [];
        if (mode === "subX") {
            subs = syllabes.map(syll => ({syll}));
        }
        if (mode === "sub50") {
            const idx = Math.floor(Math.random() * syllabes.length);
            subs = [ {syll: syllabes[idx]} ];
        }
        if (mode === "speedrun") {
            for (let i = 0; i < speedrunCount && syllabes.length; i++) {
                let idx = Math.floor(Math.random() * syllabes.length);
                subs.push({syll: syllabes[idx]});
                syllabes.splice(idx, 1);
            }
        }
        callback(subs);
    });
}

function startGame() {
    partieTerminee = false;
    $("#game-section").classList.remove("hidden");
    $("#feedback").className = "";
    $("#feedback").textContent = "";
    $("#guess-input").value = "";
    $("#guess-input").classList.remove("hidden");
    $("#return-btn").classList.add("hidden");
    $("#stop-btn").classList.toggle("hidden", currentMode !== "sub50");
    keepPlayingSub50 = false;
    skippedSyllabes = [];
    lastSkipHTML = "";

    difficulty = parseInt($("#difficulty").value, 10);
    speedrunCount = parseInt($("#speedrun-count").value, 10);

    pickSubs(currentMode, subs => {
        setOfSubs = subs;
        currentIndex = 0;
        if (!setOfSubs.length) {
            $("#syllabe-box").textContent = t("noneList");
            $("#found-box").innerHTML = "";
            $("#feedback").className = "danger";
            $("#feedback").textContent = t("change");
            $("#guess-input").classList.add("hidden");
            $("#progress-bar").innerHTML = "";
            $("#remaining-box").textContent = "";
            $("#set-progress").textContent = "";
            return;
        }
        currentSub = setOfSubs[currentIndex];
        updateSyllabeBox();
        $("#timer-box").textContent = "⏱️ "+t("time")+": 0s";
        $("#found-box").innerHTML = "";
        $("#guess-input").focus();
        $("#return-btn").classList.add("hidden");
        sessionScore++;
        showStats();
        updateProgress();
        startTime = Date.now();
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(updateTimer, 1000);

        // Charge les mots pour la première syllabe
        getWordsFromAPI(currentSub.syll, mots => {
            currentMots = mots;
        });
    });
}

function updateSyllabeBox() {
    $("#syllabe-box").innerHTML = `${t("syllabe")} : <span style="background:var(--accent);padding:3px 14px;border-radius:9px;color:#fff;">${currentSub.syll}</span>`;
    if (lastSkipHTML) {
        $("#found-box").innerHTML = lastSkipHTML;
    } else {
        $("#found-box").innerHTML = "";
    }
}

function updateTimer() {
    if (!startTime) return;
    let now = Date.now();
    let sec = Math.round((now - startTime) / 1000);
    $("#timer-box").textContent = `⏱️ ${t("time")}: ${sec}s`;
}

function nextSyllabeOrContinue() {
    lastSkipHTML = "";
    if (currentMode === "subX" || currentMode === "speedrun") {
        if (currentIndex + 1 < setOfSubs.length) {
            currentIndex++;
            currentSub = setOfSubs[currentIndex];
            updateSyllabeBox();
            $("#feedback").className = "";
            $("#feedback").textContent = "";
            $("#found-box").innerHTML = "";
            $("#guess-input").value = "";
            $("#guess-input").focus();
            updateProgress();
            startTime = Date.now();
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(updateTimer, 1000);

            // Charge les nouveaux mots
            getWordsFromAPI(currentSub.syll, mots => {
                currentMots = mots;
            });
        } else {
            endGame();
        }
    } else if (currentMode === "sub50") {
        if (!keepPlayingSub50) {
            pickSubs(currentMode, subs => {
                currentSub = subs[0];
                updateSyllabeBox();
                $("#feedback").className = "";
                $("#feedback").textContent = "";
                $("#found-box").innerHTML = "";
                $("#guess-input").value = "";
                $("#guess-input").focus();
                updateProgress();
                startTime = Date.now();
                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(updateTimer, 1000);
                getWordsFromAPI(currentSub.syll, mots => {
                    currentMots = mots;
                });
            });
        }
    }
}

function endGame() {
    let totalSec = Math.round((Date.now() - startTime) / 1000);
    $("#feedback").className = "success";
    $("#feedback").textContent = `${t("terminee")} ! (${totalSec} ${t("time").toLowerCase()}s)`;
    $("#return-btn").classList.remove("hidden");
    $("#guess-input").classList.add("hidden");
    $("#stop-btn").classList.add("hidden");
    clearInterval(timerInterval);
    partieTerminee = true;
    bestTime = bestTime ? Math.min(bestTime, totalSec) : totalSec;
    history.push({
        date: new Date().toLocaleString(),
        mode: currentMode,
        subs: setOfSubs.map(x => x.syll),
        temps: totalSec,
        score: sessionScore
    });
    showHistory();
}

function checkGuess() {
    let val = removeDiacritics($("#guess-input").value.toLowerCase().trim());
    let match = currentMots.find(m => removeDiacritics(m.toLowerCase()) === val);
    if (match) {
        lastSkipHTML = "";
        $("#found-box").innerHTML = `${t("found")} <span style='color:var(--success)'>${match}</span>`;
        $("#feedback").className = "";
        $("#feedback").textContent = "";
        $("#guess-input").value = "";
        setTimeout(nextSyllabeOrContinue, 120);
    } else if (val.length > 0) {
        $("#feedback").className = "danger";
        $("#feedback").textContent = t("none");
    } else {
        $("#feedback").className = "";
        $("#feedback").textContent = "";
    }
}

// ========== SKIP/BIND LOGIC ==========

function handleSkip() {
    skippedSyllabes.push(currentSub.syll);
    let mots = currentMots.slice().sort((a,b)=>a.length-b.length||a.localeCompare(b)).slice(0,15);
    lastSkipHTML = `${t("reponses")} "<span style="color:var(--accent2)">${currentSub.syll}</span>" : <span style="color:var(--fg)">${mots.join(", ")}${currentMots.length>15?"...":""}</span>`;
    $("#found-box").innerHTML = lastSkipHTML;
    $("#feedback").className = "";
    $("#feedback").textContent = "";
    setTimeout(nextSyllabeOrContinue, 700);
}

$("#bind-btn")?.addEventListener('click', () => {
    skipBinding = true;
    $("#bind-btn").classList.add("binding");
    $("#bind-btn").textContent = "Appuyez sur une touche...";
});

window.addEventListener("keydown", (e) => {
    if (skipBinding) {
        skipKey = e.key;
        skipBinding = false;
        $("#bind-btn").classList.remove("binding");
        $("#bind-btn").textContent = `Bind (${skipKey})`;
        e.preventDefault();
    } else if (skipKey && e.key === skipKey && !$("#guess-input").classList.contains("hidden")) {
        if (currentMode === "casual" && casualGameActive) {
            e.preventDefault();
            $("#feedback").className = "danger";
            $("#feedback").textContent = "⛔️ Le skip est désactivé en mode Min 1 !";
        } else {
            e.preventDefault();
            handleSkip();
        }
    }
});

// ========== TOKIBOT CHAT ==========

function chatbotAddMsg(msg, user = false) {
    const div = document.createElement('div');
    div.className = 'chatbot-msg ' + (user ? 'chatbot-user' : 'chatbot-bot');
    div.innerHTML = msg;
    $("#chatbot-messages").appendChild(div);
    $("#chatbot-messages").scrollTop = $("#chatbot-messages").scrollHeight + 100;
}

function chatbotHandleInput(val) {
    if (/^[/.]c\s+(\S+)$/i.test(val)) {
        const syll = val.match(/^[/.]c\s+(\S+)$/i)[1].toLowerCase();
        getWordsFromAPI(syll, mots => {
            if (mots.length > 0) {
                const motsSorted = mots
                    .slice()
                    .sort((a, b) => a.length - b.length || a.localeCompare(b));
                const motsAff = motsSorted.slice(0, 5);
                let html = `<b>${t("botw")} <span style="color:var(--accent2)">${syll.toUpperCase()}</span> :</b><br><span style="color:var(--fg)">`;
                html += motsAff.join(", ") + "</span>";
                if (mots.length > 5)
                    html += `<br><span style="font-size:0.93em;opacity:.8">${t("botmore",{n:mots.length-5})}</span>`;
                chatbotAddMsg(html);
            } else {
                chatbotAddMsg(`<b>${t("botnone")} <span style="color:var(--accent2)">${syll.toUpperCase()}</span>.</b>`);
            }
        });
    } else if (val.trim() !== "") {
        chatbotAddMsg(t("bothelp"));
    }
}

$("#chatbot-send")?.addEventListener('click', function() {
    const val = $("#chatbot-input").value;
    if (!val.trim()) return;
    chatbotAddMsg(val, true);
    chatbotHandleInput(val);
    $("#chatbot-input").value = "";
});
$("#chatbot-input")?.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
        $("#chatbot-send").click();
    }
});

window.addEventListener("DOMContentLoaded", () => {
    chatbotAddMsg(`Salut ! Je suis TokiBot 🤖<br>${t("botdesc")}<br>${t("botex")}`);
    setTheme(currentTheme);
    setLang(currentLang);
});

// ========== AUTRES ==========

function showHistory() {
    let html = "";
    if (!history.length) {
        html = "<i>"+t("noHist")+"</i>";
    } else {
        html = "<table><tr><th>Date</th><th>Mode</th><th>Syllabes</th><th>"+t("time")+"</th><th>"+t("score")+"</th></tr>";
        for (const h of history.slice(-15).reverse()) {
            html += `<tr>
                <td>${h.date}</td>
                <td>${h.mode}</td>
                <td>${h.subs.join(', ')}</td>
                <td>${h.temps}s</td>
                <td>${h.score}</td>
            </tr>`;
        }
        html += "</table>";
    }
    $("#history-list").innerHTML = html;
}

// ========== MODE CASUAL (Min 1, Bombparty style) ==========

let casualLives = 2;
let casualMaxLives = 3;
let casualTimer = null;
let casualTimeLeft = 10;
let casualLettersUsed = new Set();
let casualLivesHistory = [];
let casualWordsCount = 0;
let casualGameActive = false;
let casualStartTime = 0;
let casualDeadSyllabes = [];
let casualAlphabet = {
    fr: "abcdefghijklmnopqrstuvwxyz",
    en: "abcdefghijklmnopqrstuvwxyz",
    es: "abcdefghijklmnñopqrstuvwxyz"
};

function startCasual() {
    casualGameActive = true;
    casualLives = 2;
    casualLettersUsed = new Set();
    casualWordsCount = 0;
    casualDeadSyllabes = [];
    casualLivesHistory = [];
    casualStartTime = Date.now();
    lastSkipHTML = "";
    $("#game-section").classList.remove("hidden");
    $("#feedback").className = "";
    $("#feedback").textContent = "";
    $("#guess-input").value = "";
    $("#guess-input").classList.remove("hidden");
    $("#return-btn").classList.add("hidden");
    $("#stop-btn").classList.add("hidden");
    updateCasualStats();
    nextCasualSyllabe();
}

function updateCasualStats() {
    let lifeWord = (casualLives > 1) ? t("casual_lives") : t("casual_life");
    $("#set-progress").textContent = `🕹️ ${casualLives} ${lifeWord} | ${t("time")}: ${Math.floor((Date.now()-casualStartTime)/1000)}s | ${casualWordsCount} ${t("words").toLowerCase()}`;
}

function pickRandomSyllabeAny(callback) {
    getSyllablesPool(currentLang, syllabes => {
        if (!syllabes.length) callback(null);
        else callback(syllabes[Math.floor(Math.random() * syllabes.length)]);
    });
}

function nextCasualSyllabe() {
    lastSkipHTML = "";
    pickRandomSyllabeAny(syll => {
        if (!syll) {
            endCasual();
            return;
        }
        currentSub = {syll};
        getWordsFromAPI(syll, mots => {
            currentMots = mots;
            updateSyllabeBox();
            $("#feedback").className = "";
            $("#feedback").textContent = "";
            $("#found-box").innerHTML = "";
            $("#guess-input").value = "";
            $("#guess-input").focus();
            updateCasualStats();
            startCasualTimer();
        });
    });
}

function startCasualTimer() {
    casualTimeLeft = 10;
    $("#timer-box").textContent = `⏱️ ${t("time")}: 10s`;
    if (casualTimer) clearInterval(casualTimer);
    casualTimer = setInterval(()=>{
        casualTimeLeft--;
        $("#timer-box").textContent = `⏱️ ${t("time")}: ${casualTimeLeft}s`;
        if (casualTimeLeft <= 0) {
            clearInterval(casualTimer);
            loseCasualLife();
        }
    }, 1000);
}

function loseCasualLife() {
    casualLives--;
    casualDeadSyllabes.push(currentSub.syll);
    casualLivesHistory.push({
        type: 'timeout',
        syllabe: currentSub.syll,
        time: Math.floor((Date.now()-casualStartTime)/1000)
    });
    updateCasualStats();
    $("#feedback").className = "danger";
    $("#feedback").textContent = `⏳ ${t("none")} "${currentSub.syll}"`;
    $("#found-box").innerHTML = "";
    if (casualLives > 0) {
        setTimeout(nextCasualSyllabe, 1100);
    } else {
        setTimeout(endCasual, 1200);
    }
}

function checkGuessCasual() {
    let val = removeDiacritics($("#guess-input").value.toLowerCase().trim());
    let match = currentMots.find(m => removeDiacritics(m.toLowerCase()) === val);
    if (match) {
        lastSkipHTML = "";
        $("#found-box").innerHTML = `${t("found")} <span style='color:var(--success)'>${match}</span>`;
        $("#feedback").className = "";
        $("#feedback").textContent = "";
        $("#guess-input").value = "";
        casualWordsCount++;
        let alphabet = casualAlphabet[currentLang] || casualAlphabet.fr;
        for (let c of match.toLowerCase()) {
            if (alphabet.includes(c)) casualLettersUsed.add(c);
        }
        if (casualLettersUsed.size === alphabet.length) {
            if (casualLives < casualMaxLives) casualLives++;
            casualLettersUsed = new Set();
        }
        if (casualTimer) clearInterval(casualTimer);
        setTimeout(nextCasualSyllabe, 100);
    } else if (val.length > 0) {
        $("#feedback").className = "danger";
        $("#feedback").textContent = t("none");
    } else {
        $("#feedback").className = "";
        $("#feedback").textContent = "";
    }
    updateCasualStats();
}

function endCasual() {
    casualGameActive = false;
    if (casualTimer) clearInterval(casualTimer);
    let totalTime = Math.floor((Date.now()-casualStartTime)/1000);
    $("#feedback").className = "danger";
    $("#feedback").textContent = `${t("terminee")} !`;
    $("#return-btn").classList.remove("hidden");
    $("#guess-input").classList.add("hidden");
    $("#stop-btn").classList.add("hidden");
    let msg = `<b>${t("casual_stats")} :</b><br>`;
    msg += `- ${t("time")}: ${totalTime}s<br>`;
    msg += `- ${t("words")}: ${casualWordsCount}<br>`;
    msg += `- ${t("casual_lost")}: ${casualLivesHistory.length}<br>`;
    if (casualDeadSyllabes.length)
        msg += `- ${t("casual_deadsylls")}: <span style="color:var(--danger)">${casualDeadSyllabes.join(", ")}</span><br>`;
    chatbotAddMsg(msg);
}

// ====== INIT ======
// Les listeners d’événements restent identiques

window.onload = function () {
    document.body.setAttribute('data-theme', currentTheme);
    $("#theme-toggle").onclick = function () {
        let th = document.body.getAttribute('data-theme');
        document.body.setAttribute('data-theme', th === 'dark' ? 'light' : 'dark');
        this.textContent = th === 'dark' ? "☀️" : "🌙";
    };

    document.querySelectorAll(".mode-btn").forEach(btn => {
        btn.onclick = function () {
            document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            currentMode = btn.getAttribute("data-mode");
            $("#config-subx").classList.toggle("hidden", currentMode !== "subX");
            $("#config-speedrun").classList.toggle("hidden", currentMode !== "speedrun");
            showStats();
        };
    });

    $("#start-btn").onclick = () => {
        if (currentMode === "casual") startCasual();
        else startGame();
    };
    $("#return-btn").onclick = () => {
        $("#game-section").classList.add("hidden");
        $("#feedback").textContent = "";
        keepPlayingSub50 = false;
        casualGameActive = false;
        if (casualTimer) clearInterval(casualTimer);
    };
    $("#stop-btn").onclick = () => {
        keepPlayingSub50 = true;
        endGame();
    };
    $("#guess-input").oninput = function() {
        if (currentMode === "casual" && casualGameActive) checkGuessCasual();
        else checkGuess();
    };

    $("#toggle-import").onclick = function () {
        $("#custom-words-box").classList.toggle("hidden");
    };
    $("#load-custom").onclick = function () {
        let raw = $("#custom-words").value.trim();
        // Ici, si tu veux gérer une liste custom, tu peux envoyer vers l'API ou adapter
        // Pour l'instant, la version API utilise le dico serveur
    };
    $("#upload-txt").onchange = function (e) {
        // Pour l'instant, la version API utilise le dico serveur
    };

    $("#toggle-history").onclick = function () {
        $("#history-section").classList.toggle("hidden");
        showHistory();
    };

    window.addEventListener('keydown', e => {
        if (e.key === "Enter" && !$("#guess-input").classList.contains("hidden")) {
            if (currentMode === "casual" && casualGameActive) checkGuessCasual();
            else checkGuess();
        }
    });
};
