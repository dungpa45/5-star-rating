document.addEventListener('DOMContentLoaded', function() {
    const generateBtn = document.getElementById('generate-btn');
    const rewriteBtn = document.getElementById('rewrite-btn');
    const copyBtn = document.getElementById('copy-btn');
    const newReviewBtn = document.getElementById('new-review-btn');
    const resultContainer = document.getElementById('result-container');
    const reviewContent = document.getElementById('review-content');
    const placeNameElement = document.getElementById('place-name');
    const loadingIndicator = document.getElementById('loading');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const body = document.body;
    const editBtn = document.getElementById('edit-btn');
    let isEditing = false;
    
    // Khởi tạo Dark Mode
    function initDarkMode() {
        const isDarkMode = localStorage.getItem('darkMode') === 'true';
        body.classList.toggle('dark-mode', isDarkMode);
    }
    
    // Chuyển đổi Dark Mode
    darkModeToggle.addEventListener('click', function() {
        const isDarkMode = !body.classList.contains('dark-mode');
        body.classList.toggle('dark-mode', isDarkMode);
        localStorage.setItem('darkMode', isDarkMode);
    });
    
    // Khởi tạo
    initDarkMode();

    // Enter để submit
    document.getElementById('map-url').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') generateBtn.click();
    });
    
    // Tạo đánh giá
    generateBtn.addEventListener('click', async function() {
        const mapUrl = document.getElementById('map-url').value.trim();
        const language = document.getElementById('language').value;
        const style = document.getElementById('style').value;
        const category = document.getElementById('category').value;
        const errorMessage = document.getElementById('error-message');
        errorMessage.style.display = 'none';
        errorMessage.textContent = '';
        
        if (!mapUrl) {
            errorMessage.textContent = 'Vui lòng nhập URL Google Maps';
            errorMessage.style.display = 'block';
            return;
        }

        loadingIndicator.style.display = 'flex';
        resultContainer.style.display = 'none';
        
        try {
            const response = await fetch('/generate-review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ map_url: mapUrl, language, style, category })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                errorMessage.textContent = data.error || 'Lỗi khi tạo đánh giá';
                errorMessage.style.display = 'block';
                return;
            }
            
            if (data.success) {
                placeNameElement.textContent = data.place_name;
                reviewContent.textContent = data.review;
                resultContainer.style.display = 'block';
                errorMessage.style.display = 'none';
                resultContainer.scrollIntoView({ behavior: 'smooth' });
            } else {
                errorMessage.textContent = data.error || 'Không thể tạo đánh giá';
                errorMessage.style.display = 'block';
            }
        } catch (error) {
            console.error('Error:', error);
            errorMessage.textContent = 'Có lỗi xảy ra: ' + error.message;
            errorMessage.style.display = 'block';
        } finally {
            loadingIndicator.style.display = 'none';
        }
    });

    // Viết lại đánh giá
    rewriteBtn.addEventListener('click', async function() {
        const mapUrl = document.getElementById('map-url').value.trim();
        const language = document.getElementById('language').value;
        const style = document.getElementById('style').value;
        const category = document.getElementById('category').value;
        const previousReview = reviewContent.textContent.trim();
        
        if (!mapUrl) { alert('Vui lòng nhập URL Google Maps'); return; }

        loadingIndicator.style.display = 'flex';
        
        try {
            const response = await fetch('/generate-review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ map_url: mapUrl, language, style, category, previous_review: previousReview })
            });
            
            if (!response.ok) throw new Error('Lỗi khi tạo đánh giá');
            const data = await response.json();
            
            if (data.success) {
                reviewContent.textContent = data.review;
                reviewContent.style.animation = 'none';
                setTimeout(() => { reviewContent.style.animation = 'fadeIn 0.5s'; }, 10);
            } else {
                throw new Error('Không thể tạo đánh giá');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Có lỗi xảy ra: ' + error.message);
        } finally {
            loadingIndicator.style.display = 'none';
        }
    });

    // Sao chép đánh giá
    copyBtn.addEventListener('click', function() {
        navigator.clipboard.writeText(reviewContent.textContent)
            .then(() => {
                // Hiệu ứng sao chép thành công
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Đã sao chép!';
                copyBtn.style.backgroundColor = '#34A853';
                
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                    copyBtn.style.backgroundColor = '';
                }, 2000);
            })
            .catch(err => alert('Lỗi khi sao chép: ' + err));
    });

    // Tạo đánh giá mới
    newReviewBtn.addEventListener('click', function() {
        document.getElementById('map-url').value = '';
        resultContainer.style.display = 'none';
        document.getElementById('map-url').focus();
    });

    editBtn.addEventListener('click', function() {
        if (!isEditing) {
            reviewContent.contentEditable = 'true';
            reviewContent.focus();
            editBtn.innerHTML = '<i class="fas fa-save"></i> Lưu';
            isEditing = true;
        } else {
            reviewContent.contentEditable = 'false';
            editBtn.innerHTML = '<i class="fas fa-pen"></i> Sửa';
            isEditing = false;
        }
    });

    // On page load, try to restore review from session
    fetch('/get-session-review')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                placeNameElement.textContent = data.place_name;
                reviewContent.textContent = data.review;
                resultContainer.style.display = 'block';
            }
        });
});