from flask import Flask, render_template, request, jsonify, send_file
import requests
import json
import re
from deep_translator import GoogleTranslator
from gtts import gTTS
import io
from langdetect import detect
import speech_recognition as sr
from pydub import AudioSegment
import tempfile
import os

app = Flask(__name__)

API_KEY = ""

# Get response from Anthropic API
def get_anthropic_response(user_prompt):
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
    }
    system_prompt = (
        "You are a professional medical doctor specializing in pregnancy and other health problems. "
        "Your task is to provide advice, diagnoses, and suggestions based on the user's questions. "
        "Please ensure your responses are accurate, empathetic, and professional."
    )

    data = {
        "model": "claude-3-5-sonnet-20240620",
        "system": system_prompt,
        "max_tokens": 200,
        "messages": [
            {"role": "user", "content": user_prompt}
        ]
    }

    response = requests.post(url, headers=headers, data=json.dumps(data))
    if response.status_code == 200:
        return response.json()  # Return JSON instead of text for consistency
    else:
        return {"error": f"Error: {response.status_code} - {response.text}"}

# Format the response from Anthropic
def format_response(text):
    # Split the text into paragraphs
    paragraphs = text.split('\n')

    formatted_paragraphs = []

    for paragraph in paragraphs:
        # Format numbered lists
        paragraph = re.sub(r'(\d+)\.\s*', r'\n\1. ', paragraph)

        # Format bullet points
        paragraph = re.sub(r'(?<!\n)•\s*', r'\n• ', paragraph)
        paragraph = re.sub(r'(?<!\n)-\s*', r'\n- ', paragraph)

        # Remove extra whitespace
        paragraph = paragraph.strip()

        if paragraph:
            formatted_paragraphs.append(paragraph)

    # Join paragraphs with double newlines for better readability
    formatted_text = '\n\n'.join(formatted_paragraphs)

    return formatted_text.strip()

def is_relevant_question(user_prompt):
    relevant_keywords = [
        # Pregnancy-related keywords
        r"pregn.*", r"expecting", r"conception", r"fertility", r"miscarriage",
        r"prenatal", r"antenatal", r"trimester", r"due date", r"gestation",
        r"maternity", r"childbirth", r"labor", r"delivery", r"contractions",
        r"water broke", r"amniotic fluid", r"fetus", r"baby", r"embryo", r"ultrasound",
        r"obstetrician", r"midwife", r"lactation", r"breastfeeding", r"postpartum",
        r"morning sickness", r"nausea", r"cravings", r"weight gain", r"prenatal vitamins",
        r"prenatal care", r"obstetric", r"OB-GYN", r"pregnancy symptoms", r"pregnancy test",

        # Health-related keywords
        r"health", r"well-being", r"wellbeing", r"medical", r"doctor", r"physician",
        r"clinic", r"hospital", r"diagnosis", r"treatment", r"medication", r"drug",
        r"symptom", r"signs", r"illness", r"disease", r"condition", r"pain", r"ache",
        r"fatigue", r"fever", r"infection", r"virus", r"bacteria", r"chronic", r"acute",
        r"allergy", r"asthma", r"diabetes", r"hypertension", r"blood pressure", r"heart rate",
        r"cholesterol", r"cardiovascular", r"cancer", r"tumor", r"biopsy", r"radiation",
        r"chemotherapy", r"surgery", r"operation", r"recovery", r"rehabilitation", r"therapy",

        # Women's health-related keywords
        r"menstruation", r"period", r"menstrual", r"cycle", r"PMS", r"menopause", r"hot flashes",
        r"endometriosis", r"PCOS", r"polycystic ovary", r"ovulation", r"egg freezing",
        r"IVF", r"in vitro fertilization", r"fertility treatment", r"infertility", r"contraception",
        r"birth control", r"contraceptive", r"morning after pill", r"abortion", r"miscarriage",

        # Mental health-related keywords
        r"mental health", r"depression", r"anxiety", r"stress", r"PTSD", r"trauma",
        r"counseling", r"therapy", r"psychiatrist", r"psychologist", r"mood swings",
        r"postpartum depression", r"baby blues", r"panic attack", r"bipolar", r"schizophrenia",
        r"therapy", r"cognitive behavioral therapy", r"CBT", r"mindfulness", r"meditation",

        # General health inquiries
        r"what", r"how", r"when", r"why", r"who", r"can I", r"should I", r"do I need",
        r"is it safe", r"safe to", r"risk", r"cause", r"effect", r"side effects", r"benefit",
        r"harm", r"prevention", r"vaccine", r"immunization", r"immune system", r"allergic",
        r"skin rash", r"eczema", r"psoriasis", r"migraine", r"headache", r"stomach ache",
        r"nausea", r"vomiting", r"diarrhea", r"constipation", r"bloating", r"indigestion",
        r"acid reflux", r"GERD", r"gastrointestinal", r"intestine", r"colon", r"liver",
        r"kidney", r"pancreas", r"jaundice", r"urinary tract", r"UTI", r"bladder",
        r"urination", r"dehydration", r"hydration", r"flu", r"cold", r"allergy", r"hay fever",
        r"asthma", r"breathing", r"shortness of breath", r"oxygen", r"inhaler", r"respiratory",

        # Family planning and fertility
        r"contraception", r"birth control", r"fertility", r"IVF", r"in vitro fertilization",
        r"ovulation", r"ovary", r"fallopian tube", r"womb", r"uterus", r"sperm", r"semen analysis",
        r"surrogacy", r"egg donation", r"sperm donor", r"reproductive health", r"gynecologist",
        r"fertility treatment", r"infertility", r"family planning", r"planned parenthood",

        # Pregnancy complications
        r"ectopic pregnancy", r"high-risk pregnancy", r"preeclampsia", r"gestational diabetes",
        r"preterm labor", r"preterm birth", r"low birth weight", r"stillbirth", r"fetal distress",
        r"placenta previa", r"placental abruption", r"bleeding", r"spotting", r"miscarriage",
        r"loss", r"pregnancy loss", r"multiple pregnancies", r"twins", r"triplets", r"quadruplets",

        # Newborn care
        r"newborn", r"baby care", r"infant", r"breastfeeding", r"lactation", r"nursing",
        r"formula feeding", r"diapers", r"sleep training", r"colic", r"crying", r"soothing",
        r"baby sleep", r"infant care", r"pediatrician", r"baby check-up", r"vaccination schedule",

        # Other relevant questions and topics
        r"prenatal yoga", r"exercise during pregnancy", r"healthy diet", r"nutrition",
        r"prenatal vitamins", r"folic acid", r"iron supplements", r"calcium", r"omega-3",
        r"weight gain during pregnancy", r"gestational weight", r"body changes", r"swelling",
        r"edema", r"stretch marks", r"skin changes", r"hair changes", r"sleep during pregnancy",
        r"insomnia", r"restless legs", r"back pain", r"pelvic pain", r"Braxton Hicks",
        r"false labor", r"water breaking", r"amniotic sac", r"contractions", r"birth plan",
        r"natural birth", r"c-section", r"caesarean", r"epidural", r"pain relief during labor",

        # General follow-up question keywords
        r"what about", r"tell me more", r"can you explain", r"how about", r"can you clarify",
        r"please explain", r"what if", r"does that mean", r"should I be concerned",
        r"what should I do", r"what next", r"why is that", r"how does that work", r"how do I",
        r"can I also", r"and then", r"anything else", r"is there more", r"can it be",
        r"is it possible", r"could it be", r"should I", r"what are the options", r"what happens if",
        r"how will that affect", r"will it", r"does it mean", r"would it", r"could this",
        r"can you elaborate", r"can that", r"is it related", r"how do I know", r"does that apply",
        r"how can I tell", r"what about symptoms", r"what should I expect", r"what are the chances",
        r"how likely is", r"what does that involve", r"what could cause", r"can it lead to",
        r"should I worry", r"will it get better", r"how serious is", r"is it normal",
        r"can I prevent", r"how can I manage", r"what are the risks", r"what are the benefits",
        r"how can it affect", r"what else can I do", r"how do I avoid", r"how do I reduce",
        r"what does it feel like", r"how long does it last", r"when should I seek help",
    ]
    for keyword in relevant_keywords:
        if re.search(keyword, user_prompt, re.IGNORECASE):
            return True
    return False

# Translate text
def translate_text(text, src_lang='auto', dest_lang='en'):
    translator = GoogleTranslator(source=src_lang, target=dest_lang)
    return translator.translate(text)

# Detect language
def detect_language(text):
    try:
        return detect(text)
    except:
        return 'en'

# Synthesize speech from text
def synthesize_speech(text, lang='en'):
    if lang == 'ak':
        lang = 'en-US'
    tts = gTTS(text=text, lang=lang)
    audio_file = io.BytesIO()
    tts.write_to_fp(audio_file)
    audio_file.seek(0)
    return audio_file

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/transcribe_audio", methods=["POST"])
def transcribe_audio():
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files['audio']
    language = request.form.get('language', 'en')

    # Save the audio file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_audio:
        audio_file.save(temp_audio.name)
        temp_audio_path = temp_audio.name

    try:
        # Convert WebM to WAV
        audio = AudioSegment.from_file(temp_audio_path, format="webm")
        wav_path = temp_audio_path.replace('.webm', '.wav')
        audio.export(wav_path, format="wav")

        # Transcribe the audio
        recognizer = sr.Recognizer()
        with sr.AudioFile(wav_path) as source:
            audio_data = recognizer.record(source)
            try:
                # Always use English recognition
                text = recognizer.recognize_google(audio_data, language='en')

                # Translate to Akan if necessary
                if language == 'ak':
                    translator = GoogleTranslator(source='en', target='ak')
                    text = translator.translate(text)

                return jsonify({"text": text})
            except sr.UnknownValueError:
                return jsonify({"error": "Could not understand audio"}), 400
            except sr.RequestError:
                return jsonify({"error": "Could not request results from speech recognition service"}), 500

    except Exception as e:
        app.logger.error(f"Error transcribing audio: {str(e)}")
        return jsonify({"error": "Failed to process the audio."}), 500

    finally:
        # Clean up temporary files
        os.remove(temp_audio_path)
        if os.path.exists(wav_path):
            os.remove(wav_path)

@app.route("/chat", methods=["POST"])
def chat():
    user_input = request.json.get("message")
    language = request.json.get("language", "ak")

    if language == 'ak':
        translator = GoogleTranslator(source='ak', target='en')
        user_input = translator.translate(user_input)

    if is_relevant_question(user_input):
        try:
            response_json = get_anthropic_response(user_input)

            if "error" in response_json:
                return jsonify({"reply": response_json["error"], "language": language, "show_icons": False}), 500

            bot_response = response_json.get("content", [{}])[0].get("text", "")
            formatted_response = format_response(bot_response)

            if language == 'ak':
                translator = GoogleTranslator(source='en', target='ak')
                formatted_response = translator.translate(formatted_response)

            show_icons = "retry" in response_json or "edit" in response_json
            return jsonify({"reply": formatted_response, "language": language, "show_icons": show_icons})

        except (json.JSONDecodeError, KeyError, AttributeError) as e:
            app.logger.error(f"Error processing the response: {str(e)}")
            return jsonify({"reply": "Error processing the response, please try again later.", "language": language, "show_icons": False}), 500

    else:
        return jsonify({"error": "The question is not related to pregnancy or health problems. Please ask a relevant question.", "language": language, "show_icons": False}), 400

@app.route("/translate", methods=["POST"])
def translate():
    text = request.json.get("text")
    src_lang = request.json.get("src_lang", "auto")
    dest_lang = request.json.get("dest_lang", 'en')

    translated_text = translate_text(text, src_lang=src_lang, dest_lang=dest_lang)
    return jsonify({"translated_text": translated_text})

@app.route("/regenerate", methods=["POST"])
def regenerate():
    user_input = request.json.get("message")

    if is_relevant_question(user_input):
        try:
            response_json = get_anthropic_response(user_input)
            if "error" in response_json:
                return jsonify({"reply": response_json["error"], "show_icons": False}), 500

            bot_response = response_json.get("content", [{}])[0].get("text", "")
            formatted_response = format_response(bot_response)
            return jsonify({"reply": formatted_response, "show_icons": False})

        except (json.JSONDecodeError, KeyError, AttributeError) as e:
            app.logger.error(f"Error processing the response: {str(e)}")
            return jsonify({"reply": "Error processing the response, please try again later.", "show_icons": False}), 500

    else:
        return jsonify({"error": "The question is not related to pregnancy or health problems. Please ask a relevant question.", "show_icons": False}), 400

@app.route("/continue", methods=["POST"])
def continue_response():
    last_response = request.json.get("text")
    conversation_id = request.json.get("conversation_id")

    continue_prompt = f"Please continue the following response: {last_response}"

    try:
        response_json = get_anthropic_response(continue_prompt)

        if "error" in response_json:
            return jsonify({"reply": response_json["error"], "show_icons": False}), 500

        continuation = response_json.get("content", [{}])[0].get("text", "")
        formatted_continuation = format_response(continuation)

        full_response = last_response + "\n" + formatted_continuation

        return jsonify({"reply": full_response, "show_icons": False})

    except (json.JSONDecodeError, KeyError, AttributeError) as e:
        app.logger.error(f"Error processing the response: {str(e)}")
        return jsonify({"reply": "Error processing the response, please try again later.", "show_icons": False}), 500

@app.route("/speak", methods=["POST"])
def speak():
    text = request.json.get("text")
    lang = request.json.get("lang", 'en')

    audio_file = synthesize_speech(text, lang)

    return send_file(audio_file, mimetype="audio/mp3", as_attachment=False, attachment_filename="output.mp3")

if __name__ == "__main__":
    app.run(debug=False)
