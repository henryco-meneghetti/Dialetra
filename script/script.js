document.addEventListener("DOMContentLoaded", () => {
    const TAMANHO = 5;
    const MAX_LINHAS = 6;
    const tentativasPorModo = { facil: 6, medio: 5, dificil: 4 };
    const nomesModo = { facil: "Fácil", medio: "Médio", dificil: "Difícil" };
    const reduzirMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const tabuleiro = document.getElementById("tabuleiro");
    const teclado = document.querySelectorAll("#keyboard .key");
    const aviso = document.getElementById("aviso");
    const btnNovaPartida = document.getElementById("novaPartida");
    const seletorModo = document.getElementById("modoJogo");

    let palavraSecreta = "";
    let linhaAtual = 0;
    let colunaAtual = 0;
    let jogoAtivo = true;
    let revelando = false;
    let modoAtual = lerLocal("dialetraModo", "facil");
    if (!tentativasPorModo[modoAtual]) modoAtual = "facil";
    let maxTentativas = tentativasPorModo[modoAtual];
    let resultados = []; // cores de cada palpite, usadas no compartilhamento

    // Palavras aceitas como palpite: as secretas e a lista grande de dados/palpites.txt.
    // Se a lista não carregar (por exemplo, abrindo o index.html direto do computador),
    // o jogo continua aceitando as palavras secretas.
    const palavrasAceitas = new Set(palavras);
    if (location.protocol !== "file:") {
        fetch("dados/palpites.txt")
            .then(resposta => (resposta.ok ? resposta.text() : ""))
            .then(texto => texto.split(/\s+/).forEach(p => { if (p) palavrasAceitas.add(p); }))
            .catch(() => {});
    }

    // Cria as linhas do tabuleiro
    const linhas = [];
    for (let l = 0; l < MAX_LINHAS; l++) {
        const linha = document.createElement("div");
        linha.className = "linha";
        for (let c = 0; c < TAMANHO; c++) {
            const celula = document.createElement("div");
            celula.className = "celula";
            celula.dataset.coluna = c;
            linha.appendChild(celula);
        }
        tabuleiro.appendChild(linha);
        linhas.push(linha);
    }

    // ---------------- ESTATÍSTICAS ---------------- //

    const stats = {
        partidas: 0,
        vitorias: 0,
        derrotas: 0,
        streak: 0,
        bestStreak: 0,
        distribuicao: [0, 0, 0, 0, 0, 0],
        carregar() {
            const data = lerLocal("dialetraStats", null);
            if (!data) return;
            for (const chave of ["partidas", "vitorias", "derrotas", "streak", "bestStreak"]) {
                if (typeof data[chave] === "number") this[chave] = data[chave];
            }
            if (Array.isArray(data.distribuicao)) {
                this.distribuicao = [0, 1, 2, 3, 4, 5].map(i => data.distribuicao[i] || 0);
            }
        },
        salvar() {
            salvarLocal("dialetraStats", {
                partidas: this.partidas,
                vitorias: this.vitorias,
                derrotas: this.derrotas,
                streak: this.streak,
                bestStreak: this.bestStreak,
                distribuicao: this.distribuicao
            });
        }
    };
    stats.carregar();

    function montarEstatisticas(container, tentativaDestaque) {
        const taxa = stats.partidas ? Math.round((stats.vitorias / stats.partidas) * 100) : 0;
        const maior = Math.max(1, ...stats.distribuicao);
        const barras = stats.distribuicao.map((qtd, i) => {
            const largura = Math.max(8, Math.round((qtd / maior) * 100));
            const destaque = tentativaDestaque === i + 1 ? " destaque" : "";
            return `<div class="barra${destaque}"><span>${i + 1}</span><div style="width:${largura}%">${qtd}</div></div>`;
        }).join("");

        container.innerHTML = `
            <div class="numeros">
                <div class="numero"><strong>${stats.partidas}</strong><span>Partidas</span></div>
                <div class="numero"><strong>${taxa}%</strong><span>Vitórias</span></div>
                <div class="numero"><strong>${stats.streak}</strong><span>Sequência</span></div>
                <div class="numero"><strong>${stats.bestStreak}</strong><span>Melhor sequência</span></div>
            </div>
            <div class="distribuicao">
                <h3>Acertos por tentativa</h3>
                ${barras}
            </div>`;
    }

    // ---------------- SOM ---------------- //
    // Sons gerados pelo navegador, sem precisar de arquivos de áudio

    let somLigado = lerLocal("dialetraSom", true);
    let audio = null;
    const btnSom = document.getElementById("som");

    function atualizarBotaoSom() {
        btnSom.textContent = somLigado ? "🔊" : "🔇";
        const texto = somLigado ? "Desligar som" : "Ligar som";
        btnSom.setAttribute("aria-label", texto);
        btnSom.title = texto;
    }
    atualizarBotaoSom();

    btnSom.addEventListener("click", () => {
        somLigado = !somLigado;
        salvarLocal("dialetraSom", somLigado);
        atualizarBotaoSom();
        btnSom.blur();
    });

    function tocar(notas, duracao, volume, tipo) {
        if (!somLigado) return;
        try {
            audio = audio || new (window.AudioContext || window.webkitAudioContext)();
            if (audio.state === "suspended") audio.resume();
            notas.forEach((freq, i) => {
                const inicio = audio.currentTime + i * duracao;
                const osc = audio.createOscillator();
                const ganho = audio.createGain();
                osc.type = tipo;
                osc.frequency.value = freq;
                ganho.gain.setValueAtTime(volume, inicio);
                ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
                osc.connect(ganho).connect(audio.destination);
                osc.start(inicio);
                osc.stop(inicio + duracao);
            });
        } catch (e) {
            // Sem suporte a áudio: o jogo segue sem som
        }
    }

    const tocarTecla = () => tocar([520], 0.05, 0.04, "square");
    const tocarAcerto = () => tocar([523, 659, 784, 1047], 0.12, 0.08, "triangle");
    const tocarErro = () => tocar([220, 180], 0.12, 0.05, "sawtooth");

    // ---------------- MODAIS ---------------- //

    const modalFim = document.getElementById("fimJogoModal");
    const modalComoJogar = document.getElementById("comojogarModal");
    const modalSobre = document.getElementById("sobreModal");
    const modalEstatisticas = document.getElementById("estatisticasModal");
    const modais = [modalFim, modalComoJogar, modalSobre, modalEstatisticas];

    function abrirModal(modal) {
        modais.forEach(m => { m.hidden = true; });
        modal.hidden = false;
        const botaoFechar = modal.querySelector(".fechar");
        if (botaoFechar) botaoFechar.focus();
    }

    function fecharModais() {
        modais.forEach(m => { m.hidden = true; });
    }

    const algumModalAberto = () => modais.some(m => !m.hidden);

    modais.forEach(modal => {
        modal.addEventListener("click", e => {
            if (e.target === modal || e.target.closest(".fechar")) fecharModais();
        });
    });

    document.getElementById("comojogar").addEventListener("click", () => abrirModal(modalComoJogar));
    document.getElementById("sobre").addEventListener("click", () => abrirModal(modalSobre));
    document.getElementById("estatisticas").addEventListener("click", () => {
        montarEstatisticas(document.getElementById("estatisticasGerais"), null);
        abrirModal(modalEstatisticas);
    });

    // Primeira visita: mostra como jogar (quem já tem estatísticas não vê de novo)
    if (!lerLocal("dialetraJaJogou", false) && !lerLocal("dialetraStats", null)) {
        salvarLocal("dialetraJaJogou", true);
        abrirModal(modalComoJogar);
    }

    // ---------------- MODOS DE JOGO ---------------- //

    seletorModo.value = modoAtual;
    seletorModo.addEventListener("change", () => {
        modoAtual = seletorModo.value;
        maxTentativas = tentativasPorModo[modoAtual];
        salvarLocal("dialetraModo", modoAtual);
        seletorModo.blur();
        reiniciarJogo();
    });

    // ---------------- ENTRADA ---------------- //

    teclado.forEach(tecla => {
        tecla.addEventListener("click", () => {
            const letra = tecla.dataset.letter;
            const acao = tecla.dataset.key;
            if (letra) digitarLetra(letra);
            else if (acao === "backspace") apagarLetra();
            else if (acao === "enter") enviarPalavra();
            tecla.blur();
        });
    });

    document.addEventListener("keydown", event => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        if (algumModalAberto()) {
            if (event.key === "Escape") fecharModais();
            return;
        }
        if (event.target.tagName === "SELECT") return;

        if (!jogoAtivo) {
            if (event.key === "Enter") {
                event.preventDefault();
                reiniciarJogo();
            }
            return;
        }

        // Aceita letras com acento ou cedilha digitadas no teclado físico
        const letra = event.key.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
        if (/^[A-Z]$/.test(letra)) {
            digitarLetra(letra);
        } else if (event.key === "Backspace") {
            apagarLetra();
        } else if (event.key === "Enter") {
            event.preventDefault();
            enviarPalavra();
        } else if (event.key === "ArrowLeft") {
            moverCursor(-1);
        } else if (event.key === "ArrowRight") {
            moverCursor(1);
        }
    });

    // Clicar numa célula da linha atual move o cursor para ela
    tabuleiro.addEventListener("click", e => {
        const celula = e.target.closest(".celula");
        if (!celula || !jogoAtivo || revelando) return;
        if (celula.parentElement !== linhas[linhaAtual]) return;
        colunaAtual = Number(celula.dataset.coluna);
        atualizarAtiva();
    });

    btnNovaPartida.addEventListener("click", reiniciarJogo);
    document.getElementById("btnReiniciar").addEventListener("click", () => {
        fecharModais();
        reiniciarJogo();
    });
    document.getElementById("btnCompartilhar").addEventListener("click", compartilhar);

    // ---------------- FUNÇÕES PRINCIPAIS ---------------- //

    function digitarLetra(letra) {
        if (!jogoAtivo || revelando) return;
        const celula = linhas[linhaAtual].children[colunaAtual];
        celula.textContent = letra;
        reiniciarAnimacao(celula, "preenchida");
        tocarTecla();
        if (colunaAtual < TAMANHO - 1) colunaAtual++;
        atualizarAtiva();
    }

    function apagarLetra() {
        if (!jogoAtivo || revelando) return;
        const celulas = linhas[linhaAtual].children;
        if (celulas[colunaAtual].textContent === "" && colunaAtual > 0) colunaAtual--;
        celulas[colunaAtual].textContent = "";
        tocarTecla();
        atualizarAtiva();
    }

    function moverCursor(passo) {
        if (revelando) return;
        colunaAtual = Math.min(TAMANHO - 1, Math.max(0, colunaAtual + passo));
        atualizarAtiva();
    }

    function getPalavraAtual() {
        return Array.from(linhas[linhaAtual].children).map(c => c.textContent).join("");
    }

    function enviarPalavra() {
        if (!jogoAtivo || revelando) return;

        const palavraDigitada = getPalavraAtual().toLowerCase();
        if (palavraDigitada.length !== TAMANHO) {
            mostrarAviso("Faltam letras");
            tremerLinha();
            return;
        }
        if (!palavrasAceitas.has(palavraDigitada)) {
            mostrarAviso("Essa palavra não está na lista");
            tremerLinha();
            return;
        }

        const resultado = verificarPalavra(palavraDigitada, palavraSecreta);
        resultados.push(resultado);
        revelarLinha(linhas[linhaAtual], resultado, () => {
            resultado.forEach((cor, i) => atualizarTeclado(palavraDigitada[i].toUpperCase(), cor));

            if (palavraDigitada === palavraSecreta) {
                registrarFim(true);
                comemorar(linhas[linhaAtual]);
                tocarAcerto();
                setTimeout(() => mostrarFimJogo(true), reduzirMovimento ? 300 : 1300);
                return;
            }

            if (linhaAtual >= maxTentativas - 1) {
                registrarFim(false);
                tocarErro();
                setTimeout(() => mostrarFimJogo(false), 500);
                return;
            }

            linhaAtual++;
            colunaAtual = 0;
            atualizarAtiva();
        });
    }

    // Devolve "verde", "amarelo" ou "vermelho" para cada letra.
    // Verdes primeiro, para letras repetidas serem contadas certo.
    function verificarPalavra(palavra, secreta) {
        const resultado = [];
        const letrasDisponiveis = {};

        for (const letra of secreta)
            letrasDisponiveis[letra] = (letrasDisponiveis[letra] || 0) + 1;

        for (let i = 0; i < TAMANHO; i++) {
            if (palavra[i] === secreta[i]) {
                resultado[i] = "verde";
                letrasDisponiveis[palavra[i]]--;
            }
        }
        for (let i = 0; i < TAMANHO; i++) {
            if (resultado[i]) continue;
            const letra = palavra[i];
            if (letrasDisponiveis[letra] > 0) {
                resultado[i] = "amarelo";
                letrasDisponiveis[letra]--;
            } else {
                resultado[i] = "vermelho";
            }
        }
        return resultado;
    }

    // Vira as células uma por uma, mostrando a cor de cada letra
    function revelarLinha(linha, resultado, depois) {
        revelando = true;
        atualizarAtiva();
        const celulas = Array.from(linha.children);
        const passo = reduzirMovimento ? 0 : 220;

        celulas.forEach((celula, i) => {
            setTimeout(() => {
                if (!reduzirMovimento) reiniciarAnimacao(celula, "virando");
                setTimeout(() => celula.classList.add(resultado[i]), reduzirMovimento ? 0 : 225);
            }, i * passo);
        });

        setTimeout(() => {
            celulas.forEach(c => c.classList.remove("virando"));
            revelando = false;
            depois();
        }, reduzirMovimento ? 0 : (TAMANHO - 1) * passo + 470);
    }

    function comemorar(linha) {
        if (reduzirMovimento) return;
        Array.from(linha.children).forEach((celula, i) => {
            setTimeout(() => reiniciarAnimacao(celula, "comemorando"), i * 100);
        });
    }

    function registrarFim(venceu) {
        jogoAtivo = false;
        stats.partidas++;
        if (venceu) {
            stats.vitorias++;
            stats.streak++;
            stats.distribuicao[linhaAtual]++;
            if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
        } else {
            stats.derrotas++;
            stats.streak = 0;
        }
        stats.salvar();
        atualizarAtiva();
        btnNovaPartida.hidden = false;
    }

    function mostrarFimJogo(venceu) {
        const mensagens = ["Genial!", "Incrível!", "Muito bem!", "Boa!", "Ufa!", "Na última!"];
        const titulo = venceu
            ? (linhaAtual === maxTentativas - 1 ? "Na última!" : mensagens[linhaAtual])
            : "Não foi dessa vez";
        document.getElementById("mensagemFim").textContent = titulo;

        document.getElementById("palavraFim").innerHTML = palavraSecreta
            .toUpperCase()
            .split("")
            .map(l => `<div class="celula ${venceu ? "verde" : ""}">${l}</div>`)
            .join("");

        montarEstatisticas(document.getElementById("estatisticasFim"), venceu ? linhaAtual + 1 : null);
        abrirModal(modalFim);
    }

    function textoCompartilhar() {
        const emojis = { verde: "🟩", amarelo: "🟨", vermelho: "🟥" };
        const venceu = resultados.length && resultados[resultados.length - 1].every(c => c === "verde");
        const placar = venceu ? resultados.length : "X";
        const grade = resultados.map(r => r.map(c => emojis[c]).join("")).join("\n");
        return `Dialetra ${placar}/${maxTentativas} (${nomesModo[modoAtual]})\n\n${grade}\n\nhttps://dialetra.netlify.app`;
    }

    async function compartilhar() {
        const texto = textoCompartilhar();
        if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
            try {
                await navigator.share({ text: texto });
                return;
            } catch (e) {
                // Compartilhamento cancelado: tenta copiar
            }
        }
        try {
            await navigator.clipboard.writeText(texto);
        } catch (e) {
            const campo = document.createElement("textarea");
            campo.value = texto;
            document.body.appendChild(campo);
            campo.select();
            document.execCommand("copy");
            campo.remove();
        }
        mostrarAviso("Resultado copiado");
    }

    // ---------------- FUNÇÕES AUXILIARES ---------------- //

    function sortearPalavra() {
        let nova;
        do {
            nova = palavras[Math.floor(Math.random() * palavras.length)];
        } while (nova === palavraSecreta && palavras.length > 1);
        return nova;
    }

    function atualizarAtiva() {
        linhas.forEach((linha, li) => {
            linha.classList.toggle("atual", li === linhaAtual && jogoAtivo);
            Array.from(linha.children).forEach((cel, ci) => {
                cel.classList.toggle("ativa", li === linhaAtual && ci === colunaAtual && jogoAtivo && !revelando);
            });
        });
    }

    function atualizarTeclado(letra, status) {
        const key = document.querySelector(`#keyboard .key[data-letter="${letra}"]`);
        if (!key) return;
        const cor = status === "vermelho" ? "cinza" : status;
        if (key.classList.contains("verde")) return;
        if (key.classList.contains("amarelo") && cor === "cinza") return;
        key.classList.remove("verde", "amarelo", "cinza");
        key.classList.add(cor);
    }

    let temporizadorAviso;
    function mostrarAviso(texto) {
        aviso.textContent = texto;
        aviso.classList.add("visivel");
        clearTimeout(temporizadorAviso);
        temporizadorAviso = setTimeout(() => aviso.classList.remove("visivel"), 1800);
    }

    function tremerLinha() {
        reiniciarAnimacao(linhas[linhaAtual], "tremendo");
    }

    function reiniciarAnimacao(elemento, classe) {
        elemento.classList.remove(classe);
        void elemento.offsetWidth; // força o navegador a reiniciar a animação
        elemento.classList.add(classe);
    }

    function reiniciarJogo() {
        linhaAtual = 0;
        colunaAtual = 0;
        jogoAtivo = true;
        revelando = false;
        resultados = [];
        palavraSecreta = sortearPalavra();

        document.documentElement.style.setProperty("--linhas", maxTentativas);
        linhas.forEach((linha, index) => {
            linha.classList.remove("tremendo");
            Array.from(linha.children).forEach(celula => {
                celula.textContent = "";
                celula.className = "celula";
            });
            linha.hidden = index >= maxTentativas;
            linha.style.display = index < maxTentativas ? "flex" : "none";
        });

        teclado.forEach(tecla => tecla.classList.remove("verde", "amarelo", "cinza"));
        btnNovaPartida.hidden = true;
        atualizarAtiva();
    }

    function lerLocal(chave, padrao) {
        try {
            const valor = localStorage.getItem(chave);
            return valor === null ? padrao : JSON.parse(valor);
        } catch (e) {
            return padrao;
        }
    }

    function salvarLocal(chave, valor) {
        try {
            localStorage.setItem(chave, JSON.stringify(valor));
        } catch (e) {
            // Navegador sem armazenamento: as estatísticas valem só nesta visita
        }
    }

    reiniciarJogo();
});
