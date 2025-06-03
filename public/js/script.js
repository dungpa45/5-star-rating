document.addEventListener('DOMContentLoaded', function () {
    // State management
    const state = {
        isGenerating: false,
        currentRequest: null,
        theme: localStorage.getItem('theme') || 'light',
        lastError: null
    };

    // Element references
    const elements = {
        generateBtn: document.getElementById('generate-review-btn'),
        rewriteBtn: document.getElementById('rewrite-btn'),
        copyBtn: document.getElementById('copy-btn'),
        newReviewBtn: document.getElementById('new-review-btn'),
        resultContainer: document.getElementById('result-container'),
        reviewContent: document.getElementById('review-content'),
        placeName: document.getElementById('place-name'),
        mapUrlInput: document.getElementById('map-url'),
        urlError: document.getElementById('url-error'),
        themeToggleBtn: document.getElementById('theme-toggle-btn'),
        previewToggleBtn: document.getElementById('preview-toggle-btn'),
        previewContainer: document.getElementById('preview-container'),
        previewContent: document.getElementById('preview-content'),
        charCount: document.getElementById('char-count'),
        toast: document.getElementById('toast'),
        loading: document.getElementById('loading')
    };

    // Toast notification system with queue
    const toastQueue = [];
    let isShowingToast = false;

    function showToast(message, type = 'success', duration = 3000) {
        toastQueue.push({ message, type, duration });
        if (!isShowingToast) {
            processToastQueue();
        }
    }

    function processToastQueue() {
        if (toastQueue.length === 0) {
            isShowingToast = false;
            return;
        }

        isShowingToast = true;
        const { message, type, duration } = toastQueue.shift();
        elements.toast.textContent = message;
        elements.toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            elements.toast.className = 'toast';
            setTimeout(processToastQueue, 300);
        }, duration);
    }

    // Theme management
    function initializeTheme() {
        document.documentElement.setAttribute('data-theme', state.theme);
        updateThemeIcon(state.theme);
    }

    function updateThemeIcon(theme) {
        const icon = elements.themeToggleBtn.querySelector('i');
        icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        icon.style.transform = 'rotate(360deg)';
        setTimeout(() => {
            icon.style.transform = '';
        }, 300);
    }

    elements.themeToggleBtn.addEventListener('click', () => {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        document.body.classList.add('theme-transitioning');
        document.documentElement.setAttribute('data-theme', state.theme);
        localStorage.setItem('theme', state.theme);
        updateThemeIcon(state.theme);
        
        setTimeout(() => {
            document.body.classList.remove('theme-transitioning');
        }, 300);
    });

    // Character counter with validation
    function updateCharCount(text) {
        const count = text.length;
        elements.charCount.textContent = count;
        
        if (count > 500) {
            elements.charCount.style.color = 'var(--error-color)';
            showToast('Đánh giá vượt quá 500 ký tự', 'warning');
            return false;
        } else if (count > 400) {
            elements.charCount.style.color = 'var(--warning-color)';
        } else {
            elements.charCount.style.color = '';
        }
        return true;
    }

    // Copy to clipboard with feedback
    elements.copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(elements.reviewContent.textContent);
            showToast('Đã sao chép đánh giá vào clipboard');
            
            const originalContent = elements.copyBtn.innerHTML;
            elements.copyBtn.innerHTML = '<i class="fas fa-check"></i> Đã sao chép';
            setTimeout(() => {
                elements.copyBtn.innerHTML = originalContent;
            }, 2000);
        } catch (err) {
            showToast('Không thể sao chép đánh giá', 'error');
        }
    });

    // Preview mode with animation
    elements.previewToggleBtn.addEventListener('click', () => {
        const isVisible = elements.previewContainer.style.display !== 'none';
        elements.previewContainer.style.display = isVisible ? 'none' : 'block';
        
        const icon = elements.previewToggleBtn.querySelector('i');
        icon.className = isVisible ? 'fas fa-eye' : 'fas fa-eye-slash';
        icon.style.transform = 'scale(1.2)';
        setTimeout(() => {
            icon.style.transform = '';
        }, 200);
        
        elements.previewToggleBtn.innerHTML = isVisible ? 
            '<i class="fas fa-eye"></i> Xem trước trên Google Maps' :
            '<i class="fas fa-eye-slash"></i> Ẩn xem trước';
        
        if (!isVisible) {
            elements.previewContainer.classList.add('animate__animated', 'animate__fadeIn');
            updatePreview();
        }
    });

    function updatePreview() {
        const review = elements.reviewContent.textContent;
        elements.previewContent.textContent = review;
        
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
        state.isGenerating = true;
        elements.loading.style.display = 'flex';
        elements.generateBtn.disabled = true;
        const progressBar = document.querySelector('.progress-bar');
        progressBar.style.animation = 'progress 2s ease-in-out infinite';
    }

    function hideLoading() {
        state.isGenerating = false;
        elements.loading.style.display = 'none';
        elements.generateBtn.disabled = false;
        const progressBar = document.querySelector('.progress-bar');
        progressBar.style.animation = '';
    }

    // Request cancellation
    function cancelCurrentRequest() {
        if (state.currentRequest) {
            state.currentRequest.abort();
            state.currentRequest = null;
        }
    }

    // Create AI prompt based on style and language
    function createAIPrompt(mapUrl, language, style) {
        const stylePrompts = {
            friendly: {
                vi: 'Hãy tạo một đánh giá thân thiện, chân thành và tự nhiên như thể từ một khách hàng thực sự đã đến thăm địa điểm này. Sử dụng ngôn ngữ thân thiện, gần gũi.',
                en: 'Create a friendly, genuine, and natural review as if from a real customer who visited this place. Use warm, approachable language.'
            },
            professional: {
                vi: 'Hãy tạo một đánh giá chuyên nghiệp, khách quan và chi tiết. Tập trung vào các khía cạnh quan trọng của địa điểm và trải nghiệm tổng thể.',
                en: 'Create a professional, objective, and detailed review. Focus on important aspects of the place and overall experience.'
            },
            enthusiastic: {
                vi: 'Hãy tạo một đánh giá nhiệt tình, sôi nổi và đầy cảm xúc tích cực. Thể hiện sự phấn khích và hài lòng với trải nghiệm.',
                en: 'Create an enthusiastic, lively review full of positive emotions. Show excitement and satisfaction with the experience.'
            },
            concise: {
                vi: 'Hãy tạo một đánh giá ngắn gọn, súc tích nhưng vẫn đầy đủ thông tin quan trọng. Tập trung vào những điểm nổi bật nhất.',
                en: 'Create a concise, brief review that still covers important information. Focus on the most notable points.'
            }
        };

        const basePrompt = stylePrompts[style][language] || stylePrompts.friendly[language];
        return `${basePrompt}\n\nURL: ${mapUrl}`;
    }

    // Generate review with improved error handling
    async function generateReview(mapUrl, language, style) {
        if (state.isGenerating) {
            showToast('Đang tạo đánh giá, vui lòng đợi...', 'warning');
            return;
        }

        cancelCurrentRequest();
        showLoading();

        try {
            const controller = new AbortController();
            state.currentRequest = controller;

            const response = await fetch('/api/generate-review', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    mapUrl,
                    prompt: createAIPrompt(mapUrl, language, style)
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to generate review');
            }

            const { review, placeInfo, error } = await response.json();
            
            if (error) {
                throw new Error(error);
            }

            if (!review) {
                throw new Error('No review generated');
            }

            // Update UI
            elements.reviewContent.textContent = review;
            if (placeInfo?.name) {
                elements.placeName.textContent = placeInfo.name;
            }
            
            elements.resultContainer.style.display = 'block';
            elements.resultContainer.classList.add('animate__animated', 'animate__fadeIn');
            
            updateCharCount(review);
            if (elements.previewContainer.style.display !== 'none') {
                updatePreview();
            }

            showToast('Đã tạo đánh giá thành công');
            return review;
        } catch (error) {
            if (error.name === 'AbortError') {
                showToast('Đã hủy tạo đánh giá', 'warning');
            } else {
                console.error('Error:', error);
                showToast(error.message || 'Có lỗi xảy ra khi tạo đánh giá', 'error');
                state.lastError = error;
            }
            throw error;
        } finally {
            hideLoading();
            state.currentRequest = null;
        }
    }

    // Event listeners
    elements.generateBtn.addEventListener('click', async () => {
        const mapUrl = elements.mapUrlInput.value.trim();
        const language = document.getElementById('language').value;
        const style = document.getElementById('style').value;
        
        if (!mapUrl) {
            showToast('Vui lòng nhập URL', 'error');
            elements.mapUrlInput.focus();
            return;
        }

        try {
            await generateReview(mapUrl, language, style);
        } catch (error) {
            // Error already handled in generateReview
        }
    });

    elements.mapUrlInput.addEventListener('input', () => {
        const hasValue = elements.mapUrlInput.value.trim().length > 0;
        elements.generateBtn.disabled = !hasValue;
    });

    elements.newReviewBtn.addEventListener('click', () => {
        cancelCurrentRequest();
        elements.mapUrlInput.value = '';
        elements.urlError.textContent = '';
        elements.resultContainer.style.display = 'none';
        elements.previewContainer.style.display = 'none';
        elements.previewToggleBtn.innerHTML = '<i class="fas fa-eye"></i> Xem trước trên Google Maps';
        elements.mapUrlInput.focus();
        showToast('Đã tạo đánh giá mới', 'success');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            elements.generateBtn.click();
        }
        
        if (e.key === 'Escape') {
            if (elements.previewContainer.style.display !== 'none') {
                elements.previewToggleBtn.click();
            }
            if (state.isGenerating) {
                cancelCurrentRequest();
            }
        }
    });

    // Initialize
    function init() {
        initializeTheme();
        elements.generateBtn.disabled = true;
    }

    // Start the app
    init();
});