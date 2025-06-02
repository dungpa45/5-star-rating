document.addEventListener('DOMContentLoaded', function () {
    const generateBtn = document.getElementById('generate-btn');
    const rewriteBtn = document.getElementById('rewrite-btn');
    const copyBtn = document.getElementById('copy-btn');
    const newReviewBtn = document.getElementById('new-review-btn');
    const resultContainer = document.getElementById('result-container');
    const reviewContent = document.getElementById('review-content');
    const placeNameElement = document.getElementById('place-name');
    const mapUrlInput = document.getElementById('map-url');
    const urlError = document.getElementById('url-error');
    
    // New element references
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const previewToggleBtn = document.getElementById('preview-toggle-btn');
    const previewContainer = document.getElementById('preview-container');
    const previewContent = document.getElementById('preview-content');
    const charCount = document.getElementById('char-count');
    const toast = document.getElementById('toast');

    // Toast notification system
    function showToast(message, type = 'success', duration = 3000) {
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.className = 'toast';
        }, duration);
    }

    // Theme handling with animation
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.body.classList.add('theme-transitioning');
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
        
        setTimeout(() => {
            document.body.classList.remove('theme-transitioning');
        }, 300);
    });

    function updateThemeIcon(theme) {
        const icon = themeToggleBtn.querySelector('i');
        icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        icon.style.transform = 'rotate(360deg)';
        setTimeout(() => {
            icon.style.transform = '';
        }, 300);
    }

    // Character counter with validation
    function updateCharCount(text) {
        const count = text.length;
        charCount.textContent = count;
        
        if (count > 500) {
            charCount.style.color = 'var(--error-color)';
            showToast('Đánh giá vượt quá 500 ký tự', 'warning');
        } else if (count > 400) {
            charCount.style.color = 'var(--warning-color)';
        } else {
            charCount.style.color = '';
        }
    }

    // Copy to clipboard with feedback
    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(reviewContent.textContent);
            showToast('Đã sao chép đánh giá vào clipboard');
            
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Đã sao chép';
            setTimeout(() => {
                copyBtn.innerHTML = '<i class="fas fa-copy"></i> Sao chép';
            }, 2000);
        } catch (err) {
            showToast('Không thể sao chép đánh giá', 'error');
        }
    });

    // Preview mode with animation
    previewToggleBtn.addEventListener('click', () => {
        const isVisible = previewContainer.style.display !== 'none';
        previewContainer.style.display = isVisible ? 'none' : 'block';
        
        const icon = previewToggleBtn.querySelector('i');
        icon.className = isVisible ? 'fas fa-eye' : 'fas fa-eye-slash';
        icon.style.transform = 'scale(1.2)';
        setTimeout(() => {
            icon.style.transform = '';
        }, 200);
        
        previewToggleBtn.innerHTML = isVisible ? 
            '<i class="fas fa-eye"></i> Xem trước trên Google Maps' :
            '<i class="fas fa-eye-slash"></i> Ẩn xem trước';
        
        if (!isVisible) {
            previewContainer.classList.add('animate__animated', 'animate__fadeIn');
            updatePreview();
        }
    });

    function updatePreview() {
        const review = reviewContent.textContent;
        previewContent.textContent = review;
        
        const dateElement = document.querySelector('.review-date');
        const now = new Date();
        dateElement.innerHTML = `<i class="fas fa-clock"></i> ${formatDate(now)}`;
    }

    function formatDate(date) {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (date.toDateString() === today.toDateString()) {
            return 'Hôm nay';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Hôm qua';
        } else {
            return date.toLocaleDateString('vi-VN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    }

    // Loading state management
    function showLoading() {
        const loading = document.getElementById('loading');
        loading.style.display = 'flex';
        const progressBar = document.querySelector('.progress-bar');
        progressBar.style.animation = 'progress 2s ease-in-out infinite';
    }

    function hideLoading() {
        const loading = document.getElementById('loading');
        loading.style.display = 'none';
        const progressBar = document.querySelector('.progress-bar');
        progressBar.style.animation = '';
    }

    // Generate review with improved error handling
    generateBtn.addEventListener('click', async () => {
        const mapUrl = mapUrlInput.value.trim();
        const language = document.getElementById('language').value;
        const style = document.getElementById('style').value;
        
        if (!mapUrl) {
            showToast('Vui lòng nhập URL', 'error');
            mapUrlInput.focus();
            return;
        }

        showLoading();
        
        try {
            const review = await generateReview(mapUrl, language, style);
            resultContainer.style.display = 'block';
            resultContainer.classList.add('animate__animated', 'animate__fadeIn');
            showToast('Đã tạo đánh giá thành công');
        } catch (error) {
            console.error('Error:', error);
            showToast('Có lỗi xảy ra khi tạo đánh giá', 'error');
        } finally {
            hideLoading();
        }
    });

    // Remove URL validation
    mapUrlInput.addEventListener('input', () => {
        generateBtn.disabled = !mapUrlInput.value.trim();
    });

    // New review button with reset
    newReviewBtn.addEventListener('click', () => {
        mapUrlInput.value = '';
        urlError.textContent = '';
        resultContainer.style.display = 'none';
        previewContainer.style.display = 'none';
        previewToggleBtn.innerHTML = '<i class="fas fa-eye"></i> Xem trước trên Google Maps';
        mapUrlInput.focus();
        showToast('Đã tạo đánh giá mới', 'success');
    });

    // Hàm mới để gọi AI tạo đánh giá
    async function generateAIReview(mapUrl, language, style) {
        try {
            // Generate review using AI
            const prompt = createAIPrompt(mapUrl, language, style);
            console.log('Generated Prompt:', {
                mapUrl,
                language,
                style,
                fullPrompt: prompt
            });
            const aiResponse = await callRealAICloudFunction(prompt);
            return aiResponse.review;
        } catch (error) {
            console.error("Lỗi khi tạo đánh giá AI:", error);
            throw error;
        }
    }

    // Hàm gọi AI thông qua backend proxy
    async function callRealAICloudFunction(prompt) {
        const mapUrl = document.getElementById('map-url').value.trim();
        console.log('Sending to API:', {
            prompt,
            mapUrl: mapUrl || 'not provided'
        });
        
        const response = await fetch('/api/generate-review', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                prompt,
                mapUrl: mapUrl || undefined
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            console.error('API Error:', error);
            throw new Error(error.message || 'AI service error');
        }
        
        const { review, placeInfo } = await response.json();
        console.log('API Response:', {
            review,
            placeInfo
        });
        
        if (!review) {
            throw new Error('No review generated');
        }

        // Update place name if we got it from the URL
        if (placeInfo?.name) {
            document.getElementById('place-name').textContent = placeInfo.name;
        }
        
        return { review };
    }

    function createAIPrompt(mapUrl, language, style) {
        const languageNames = {
            vi: "tiếng Việt",
            en: "English"
        };

        const styleDescriptions = {
            friendly: "thân thiện, tự nhiên như đang nói chuyện với bạn bè",
            professional: "chuyên nghiệp, khách quan như một nhà phê bình",
            enthusiastic: "nhiệt tình, hào hứng với nhiều cảm xúc tích cực",
            concise: "ngắn gọn súc tích trong 1-2 câu"
        };

        let prompt = `Hãy viết một đánh giá 5 sao cho địa điểm tại URL Google Maps này: ${mapUrl} với các yêu cầu sau:
- Ngôn ngữ: ${languageNames[language] || 'tiếng Việt'}
- Phong cách: ${styleDescriptions[style] || 'thân thiện'}
- Độ dài: ${style === 'concise' ? 'rất ngắn' : 'trung bình 3-5 câu'}

Yêu cầu: 
1. Đảm bảo tự nhiên, không lặp lại máy móc
2. Nhấn mạnh ưu điểm nhưng không quá chung chung
3. Có thể thêm 1-2 chi tiết cụ thể (món ngon, dịch vụ tốt, không gian đẹp...)`;

        return prompt;
    }

    async function generateReview(mapUrl, language, style) {
        console.log('Generating Review:', {
            mapUrl,
            language,
            style
        });
        
        const aiReview = await generateAIReview(mapUrl, language, style);
        
        console.log('Generated Review:', {
            review: aiReview
        });
        
        // Update review content and character count
        reviewContent.textContent = aiReview;
        updateCharCount(aiReview);
        
        // Update preview if visible
        if (previewContainer.style.display !== 'none') {
            updatePreview();
        }
        
        return aiReview;
    }

    // Initialize
    function init() {
        generateBtn.disabled = !mapUrlInput.value.trim();
        
        mapUrlInput.addEventListener('input', () => {
            generateBtn.disabled = !mapUrlInput.value.trim();
        });
        
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                generateBtn.click();
            }
            
            if (e.key === 'Escape' && previewContainer.style.display !== 'none') {
                previewToggleBtn.click();
            }
        });
    }

    // Start the app
    init();
});