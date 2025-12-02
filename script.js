const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const fileInput = document.getElementById('file-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const clearImageBtn = document.getElementById('clear-image');
const modal = document.getElementById('api-modal');
const closeBtn = document.getElementById('close-modal-btn');
const settingsBtn = document.getElementById('settings-btn');
const navItems = document.querySelectorAll('.nav-item');
const menuToggle = document.getElementById('menu-toggle');
const sidebar = document.getElementById('sidebar');
const closeSidebarBtn = document.getElementById('close-sidebar');

let currentMode = 'chat';
let currentImageBase64 = null;

function showModal() {
    modal.style.display = 'flex';
}

closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
});

settingsBtn.addEventListener('click', () => {
    showModal();
});

// Открытие/закрытие сайдбара
menuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('open');
});

if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener('click', () => {
        sidebar.classList.remove('open');
    });
}

document.addEventListener('click', (e) => {
    if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
        sidebar.classList.remove('open');
    }
});

// Переключение режимов
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        currentMode = item.dataset.mode;
    });
});

// Загрузка изображения
fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            currentImageBase64 = e.target.result.split(',')[1];
            imagePreview.src = e.target.result;
            imagePreviewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
});

// Очистка изображения
clearImageBtn.addEventListener('click', clearImage);
function clearImage() {
    fileInput.value = '';
    currentImageBase64 = null;
    imagePreviewContainer.classList.add('hidden');
}

// Отправка сообщения
sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text && !currentImageBase64) return;

    if (currentImageBase64) {
        addMessage("[Изображение]", 'user', `data:image/jpeg;base64,${currentImageBase64}`);
    }
    if (text) {
        addMessage(text, 'user');
    }

    userInput.value = '';
    if (currentImageBase64) clearImage();

    const loadingId = addMessage('shaman думает...', 'ai', null, true);

    try {
        const response = await callQwen(text, currentImageBase64);
        updateMessage(loadingId, response);
    } catch (error) {
        updateMessage(loadingId, `Ошибка: ${error.message}`);
    }
}

function addMessage(text, sender, imgSrc = null, isLoading = false) {
    const div = document.createElement('div');
    div.classList.add('message', sender);
    if (isLoading) div.id = `loading-${Date.now()}`;

    if (imgSrc) {
        const img = document.createElement('img');
        img.src = imgSrc;
        img.classList.add('chat-img');
        div.appendChild(img);
    }

    if (text) {
        const p = document.createElement('div');
        p.textContent = text;
        div.appendChild(p);
    }

    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return div.id;
}

function updateMessage(id, rawContent) {
    const div = document.getElementById(id);
    if (!div) return;
    div.innerHTML = '';

    let contentToShow = rawContent;

    // Обработка графиков и SVG
    const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);
    const svgMatch = rawContent.match(/```svg\s*([\s\S]*?)\s*```/) || rawContent.match(/(<svg[\s\S]*?<\/svg>)/);

    if (currentMode === 'graph' && jsonMatch) {
        try {
            const graphData = JSON.parse(jsonMatch[1]);
            const plotDiv = document.createElement('div');
            plotDiv.className = 'plot-container';
            div.appendChild(plotDiv);

            const data = Array.isArray(graphData) ? graphData : (graphData.data || [graphData]);
            const layout = graphData.layout || {
                autosize: true,
                margin: { t: 30, r: 30, l: 40, b: 40 },
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)'
            };

            Plotly.newPlot(plotDiv, data, layout, { responsive: true });
            contentToShow = contentToShow.replace(jsonMatch[0], '');
        } catch (e) {
            console.error('Ошибка графика:', e);
        }
    }

    if ((currentMode === 'draw' || currentMode === 'chat') && svgMatch) {
        const svgCode = svgMatch[1] || svgMatch[0];
        const svgContainer = document.createElement('div');
        svgContainer.className = 'svg-container';
        svgContainer.innerHTML = svgCode;
        div.appendChild(svgContainer);
        contentToShow = contentToShow.replace(svgMatch[0], '');
    }

    // === ОБРАБОТКА ТЕКСТА БЕЗ MARKED — ДЛЯ КОРРЕКТНОГО LA TEX ===
    if (contentToShow.trim()) {
        const textDiv = document.createElement('div');
        textDiv.style.lineHeight = '1.6';

        // Разбиваем текст по формулам
        const parts = [];
        let lastIndex = 0;
        let match;

        // Ищем $...$ формулы
        const latexRegex = /\$(.*?)\$/g;
        while ((match = latexRegex.exec(contentToShow)) !== null) {
            // Текст до формулы
            if (match.index > lastIndex) {
                parts.push({ type: 'text', content: contentToShow.slice(lastIndex, match.index) });
            }
            // Формула
            parts.push({ type: 'latex', content: match[1] });
            lastIndex = match.index + match[0].length;
        }
        // Остаток текста
        if (lastIndex < contentToShow.length) {
            parts.push({ type: 'text', content: contentToShow.slice(lastIndex) });
        }

        // Рендерим части
        parts.forEach(part => {
            if (part.type === 'text') {
                const span = document.createElement('span');
                span.textContent = part.content;
                textDiv.appendChild(span);
            } else if (part.type === 'latex') {
                const span = document.createElement('span');
                span.textContent = `$${part.content}$`;
                textDiv.appendChild(span);
            }
        });

        div.appendChild(textDiv);
    }

    // Рендерим LaTeX
    if (window.MathJax) {
        MathJax.typesetPromise([div]).catch(console.error);
    }

    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// === ВАЖНО: ИСПОЛЬЗУЙТЕ БЭКЕНД-ПРОКСИ! ===
async function callQwen(prompt, imageBase64 = null) {
    let systemPrompt = "Ты ShamanAi — умный помощник на базе шамана. Отвечай на русском. Используй ТОЛЬКО формат $...$ для формул. НЕ окружай формулы скобками или кавычками.";

    if (currentMode === 'graph') {
        systemPrompt += " Пользователь просит график. Верни ТОЛЬКО JSON для Plotly.js в блоке ```json ... ```.";
    } else if (currentMode === 'draw') {
        systemPrompt += " Пользователь хочет рисунок. Верни ТОЛЬКО корректный SVG в блоке ```svg ... ``` с чёрными линиями.";
    }

    const messages = [{ role: "system", content: systemPrompt }];

    // МУЛЬТИМОДАЛЬНЫЙ ФОРМАТ — ОБЯЗАТЕЛЕН ДЛЯ QWEN-VL
    const userContent = [];
    if (prompt) userContent.push({ type: "text", text: prompt });
    if (imageBase64) {
        userContent.push({
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
        });
    }
    messages.push({ role: "user", content: userContent });

    // ⚠️ ЗАМЕНИТЕ ЭТОТ URL НА ВАШУ NETLIFY FUNCTION!
    const response = await fetch('/.netlify/functions/proxy', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: "qwen/qwen-vl-plus",
            messages: messages,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ошибка API: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "Нет ответа.";
}
