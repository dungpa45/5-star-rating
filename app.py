from flask import Flask, render_template, request, jsonify, session
from g4f.client import AsyncClient
import re
import time
import urllib.parse
import asyncio
import logging
from logging.handlers import RotatingFileHandler

app = Flask(__name__)
app.secret_key = 'your_secret_key_here'  # Replace with a secure random key in production

# Logging setup
handler = RotatingFileHandler('app.log', maxBytes=1000000, backupCount=3)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s : %(message)s',
    handlers=[handler]
)
logger = logging.getLogger(__name__)

# Hàm trích xuất tên địa điểm từ URL
def extract_place_name(url):
    try:
        if 'maps/place/' in url:
            parts = url.split('maps/place/')[1].split('/')
            name = re.sub(r'\+', ' ', parts[0])
            return urllib.parse.unquote(name)
        return None
    except:
        return None

# Hàm tạo đánh giá AI (async)
async def generate_ai_review(place_name, language, style):
    prompt = create_ai_prompt(place_name, language, style)
    client = AsyncClient()
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content

def create_ai_prompt(place_name, language, style):
    language_names = {
        'vi': "tiếng Việt",
        'en': "English"
    }
    
    style_descriptions = {
        'friendly': "thân thiện, tự nhiên như đang nói chuyện với bạn bè",
        'professional': "chuyên nghiệp, khách quan như một nhà phê bình",
        'enthusiastic': "nhiệt tình, hào hứng với nhiều cảm xúc tích cực",
        'concise': "ngắn gọn súc tích trong 1-2 câu"
    }
    
    prompt = f'Hãy viết một đánh giá 5 sao cho "{place_name}" trên Google Maps với các yêu cầu sau:\n'
    prompt += f'- Ngôn ngữ: {language_names.get(language, "tiếng Việt")}\n'
    prompt += f'- Phong cách: {style_descriptions.get(style, "thân thiện")}\n'
    prompt += f'- Độ dài: {"rất ngắn" if style == "concise" else "trung bình 3-5 câu"}'
    
    prompt += '\n\nYêu cầu: \n'
    prompt += '1. Đảm bảo tự nhiên, không lặp lại máy móc\n'
    prompt += '2. Nhấn mạnh ưu điểm nhưng không quá chung chung\n'
    prompt += '3. Có thể thêm 1-2 chi tiết cụ thể (món ngon, dịch vụ tốt, không gian đẹp...)'
    
    return prompt

def extract_place_name_from_prompt(prompt):
    match = re.search(r'cho "([^"]+)"', prompt)
    return match.group(1) if match else "địa điểm này"

def is_google_maps_url(url):
    return url and ('google.com/maps' in url or 'maps.app.goo.gl' in url)

# Route chính
@app.route('/',methods=["GET","POST"])
def index():
    return render_template('index.html')

# API tạo đánh giá
@app.route('/generate-review', methods=['POST'])
def generate_review():
    data = request.json
    map_url = data.get('map_url')
    language = data.get('language', 'vi')
    style = data.get('style', 'friendly')

    logger.info(f"Received /generate-review request: url={map_url}, lang={language}, style={style}")

    # Validate Google Maps URL
    if not is_google_maps_url(map_url):
        logger.warning(f"Invalid Google Maps URL: {map_url}")
        return jsonify({
            'success': False,
            'error': 'Vui lòng nhập đúng URL Google Maps.'
        }), 400
    
    # Trích xuất tên địa điểm
    place_name = extract_place_name(map_url) or "địa điểm này"
    
    # Tạo đánh giá bằng AI (async)
    try:
        review = asyncio.run(generate_ai_review(place_name, language, style))
        logger.info(f"Generated review for '{place_name}'")
        session['review'] = {
            'place_name': place_name,
            'review': review
        }
    except Exception as e:
        logger.error(f"AI error for '{place_name}': {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Lỗi AI: {str(e)}'
        }), 500
    
    return jsonify({
        'success': True,
        'place_name': place_name,
        'review': review
    })

@app.route('/get-session-review', methods=['GET'])
def get_session_review():
    review_data = session.get('review')
    if review_data:
        return jsonify({'success': True, **review_data})
    else:
        return jsonify({'success': False, 'error': 'No review found in session.'}), 404

if __name__ == '__main__':
    app.run(debug=True,host="0.0.0.0",port=3000)