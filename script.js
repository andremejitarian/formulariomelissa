class PsychologySurvey {
    constructor() {
        this.questions = [];
        this.responses = {};
        this.isDragging = false;
        this.currentSlider = null;
        
        this.init();
    }

    async init() {
        try {
            await this.loadQuestions();
            this.renderQuestions();
            this.setupEventListeners();
            this.hideLoading();
        } catch (error) {
            console.error('Erro ao inicializar:', error);
            this.showError('Erro ao carregar o questionário. Tente recarregar a página.');
        }
    }

    async loadQuestions() {
        try {
            const response = await fetch('questions.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.questions = await response.json();
        } catch (error) {
            console.error('Erro ao carregar questions.json:', error);
            throw error;
        }
    }

    renderQuestions() {
        const container = document.getElementById('questions-container');
        container.innerHTML = '';

        this.questions.forEach((question, index) => {
            const questionElement = this.createQuestionElement(question, index + 1);
            container.appendChild(questionElement);
            
            // Inicializar slider
            this.initializeSlider(question.id);
        });
    }

    createQuestionElement(question, number) {
        const div = document.createElement('div');
        div.className = 'question-item';
        div.dataset.questionId = question.id;

        div.innerHTML = `
            <div class="question-number">Pergunta ${number}</div>
            <div class="question-text">${question.statement}</div>
            
            <div class="slider-container">
                <div class="slider-wrapper">
                    <span class="slider-label">${question.leftLabel}</span>
                    <div class="slider-track" id="track-${question.id}">
                        <div class="slider-thumb" id="thumb-${question.id}"></div>
                    </div>
                    <span class="slider-label">${question.rightLabel}</span>
                </div>
                
                <div class="value-display">
                    <span class="value-number" id="value-${question.id}">50</span>
                </div>
                
                <input type="hidden" name="question_${question.id}" value="50" id="input-${question.id}">
            </div>
            
            ${question.instructions ? `
                <div class="question-instructions">
                    💡 ${question.instructions}
                </div>
            ` : ''}
        `;

        return div;
    }

    initializeSlider(questionId) {
        const thumb = document.getElementById(`thumb-${questionId}`);
        const track = document.getElementById(`track-${questionId}`);
        const valueDisplay = document.getElementById(`value-${questionId}`);
        const input = document.getElementById(`input-${questionId}`);

        // Posição inicial (50%)
        thumb.style.left = '50%';
        this.responses[questionId] = 50;

        // Event listeners
        thumb.addEventListener('mousedown', (e) => this.startDrag(e, questionId));
        thumb.addEventListener('touchstart', (e) => this.startDrag(e, questionId), { passive: false });
        
        track.addEventListener('mousedown', (e) => this.clickToPosition(e, questionId));
        track.addEventListener('touchstart', (e) => this.clickToPosition(e, questionId), { passive: false });
    }

    startDrag(e, questionId) {
        e.preventDefault();
        this.isDragging = true;
        this.currentSlider = questionId;

        const thumb = document.getElementById(`thumb-${questionId}`);
        thumb.classList.add('dragging');

        // Event listeners globais
        document.addEventListener('mousemove', this.handleDrag.bind(this));
        document.addEventListener('mouseup', this.stopDrag.bind(this));
        document.addEventListener('touchmove', this.handleDrag.bind(this), { passive: false });
        document.addEventListener('touchend', this.stopDrag.bind(this));
    }

    handleDrag(e) {
        if (!this.isDragging || !this.currentSlider) return;

        e.preventDefault();
        this.updateSliderPosition(e, this.currentSlider);
    }

    stopDrag() {
        if (!this.isDragging) return;

        this.isDragging = false;
        
        if (this.currentSlider) {
            const thumb = document.getElementById(`thumb-${this.currentSlider}`);
            thumb.classList.remove('dragging');
        }

        this.currentSlider = null;

        // Remover event listeners globais
        document.removeEventListener('mousemove', this.handleDrag.bind(this));
        document.removeEventListener('mouseup', this.stopDrag.bind(this));
        document.removeEventListener('touchmove', this.handleDrag.bind(this));
        document.removeEventListener('touchend', this.stopDrag.bind(this));
    }

    clickToPosition(e, questionId) {
        if (e.target.classList.contains('slider-thumb')) return;
        
        this.updateSliderPosition(e, questionId);
    }

    updateSliderPosition(e, questionId) {
        const track = document.getElementById(`track-${questionId}`);
        const thumb = document.getElementById(`thumb-${questionId}`);
        const valueDisplay = document.getElementById(`value-${questionId}`);
        const input = document.getElementById(`input-${questionId}`);

        const rect = track.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        
        let position = (clientX - rect.left) / rect.width;
        position = Math.max(0, Math.min(1, position)); // Limitar entre 0 e 1

        const percentage = Math.round(position * 100);
        
        thumb.style.left = `${position * 100}%`;
        valueDisplay.textContent = percentage;
        input.value = percentage;
        this.responses[questionId] = percentage;
    }

    setupEventListeners() {
        const form = document.getElementById('survey-form');
        form.addEventListener('submit', this.handleSubmit.bind(this));
    }

    handleSubmit(e) {
        e.preventDefault();
        
        // NOVO: Capturar o nome do usuário
        const userNameInput = document.getElementById('userName');
        const userName = userNameInput.value.trim(); // .trim() remove espaços em branco extras

        if (!userName) {
            alert('Por favor, digite seu nome antes de enviar.');
            userNameInput.focus(); // Coloca o foco no campo do nome
            return;
        }

        // Validar se todas as perguntas foram respondidas
        const unanswered = this.questions.filter(q => this.responses[q.id] === undefined);
        
        if (unanswered.length > 0) {
            alert('Por favor, responda todas as perguntas antes de enviar.');
            return;
        }

        // Preparar dados para envio, incluindo o nome
        const surveyData = {
            userName: userName, // Adiciona o nome do usuário aqui
            timestamp: new Date().toISOString(),
            responses: this.responses,
            totalQuestions: this.questions.length
        };

        console.log('�� Dados da Pesquisa:', surveyData);
        
        // Simular envio
        this.simulateSubmission(surveyData);
    }

    simulateSubmission(data) {
        const submitBtn = document.querySelector('.submit-btn');
        const originalText = submitBtn.innerHTML;
        
        submitBtn.innerHTML = '<span class="spinner"></span> Enviando...';
        submitBtn.disabled = true;

        setTimeout(() => {
            alert('✅ Respostas enviadas com sucesso!\n\nObrigado por participar da pesquisa.');
            console.log('Dados enviados:', data);
            
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            
            // Opcional: resetar formulário ou redirecionar
            // this.resetForm(); // Você pode considerar um reset que limpe também o campo do nome
        }, 2000);
    }

    hideLoading() {
        const loading = document.getElementById('loading');
        loading.classList.add('hidden');
    }

    showError(message) {
        const container = document.getElementById('questions-container');
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #ef4444;">
                <h3>❌ Erro</h3>
                <p>${message}</p>
            </div>
        `;
        this.hideLoading();
    }

    resetForm() {
        // NOVO: Resetar o campo do nome
        const userNameInput = document.getElementById('userName');
        if (userNameInput) {
            userNameInput.value = '';
        }

        this.responses = {};
        this.questions.forEach(question => {
            const thumb = document.getElementById(`thumb-${question.id}`);
            const valueDisplay = document.getElementById(`value-${question.id}`);
            const input = document.getElementById(`input-${question.id}`);
            
            if (thumb && valueDisplay && input) { // Adicionado verificação para garantir que os elementos existem
                thumb.style.left = '50%';
                valueDisplay.textContent = '50';
                input.value = '50';
                this.responses[question.id] = 50;
            }
        });
    }
}

// Inicializar quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    new PsychologySurvey();
});
