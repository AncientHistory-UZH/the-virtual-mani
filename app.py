import streamlit as st
import os
import xml.etree.ElementTree as ET
import re
import pandas as pd
from pathlib import Path
import google.generativeai as genai
import time

# --- PAGE CONFIGURATION ---
st.set_page_config(
    page_title="The Virtual Mani",
    page_icon="📖",
    layout="wide"
)

# --- DATA MODEL ---
class Manuscript:
    """Represents a single manuscript with its reconstructions."""
    def __init__(self, file_id, lacuna_size, original_lines):
        self.id = file_id
        self.lacuna_size = lacuna_size
        self.original_lines = original_lines
        self.reconstructions = {}

    def add_reconstruction(self, model_name, lines):
        self.reconstructions[model_name] = lines

    def get_full_text(self, model_name=None):
        """Gets the full text of the original or a reconstruction."""
        lines_to_use = self.original_lines
        if model_name and model_name in self.reconstructions:
            lines_to_use = self.reconstructions[model_name]
        
        return "\n".join(line['text'] for line in lines_to_use if line['text'])

# --- DATA LOADING & PROCESSING (REWRITTEN) ---
@st.cache_data
def load_data(data_path_str):
    """Loads all manuscript data from the specified directory structure."""
    data_path = Path(data_path_str)
    if not data_path.is_dir():
        raise FileNotFoundError(f"Data directory not found at '{data_path_str}'. Please check the path.")

    originals_path = data_path / "originals"
    if not originals_path.is_dir():
        raise FileNotFoundError(f"'originals' folder not found inside '{data_path_str}'.")

    manuscripts = {}
    model_name_mapping = {'gpt': 'GPT-4o', 'gemini': 'Gemini 1.5', 'claude': 'Claude Sonnet 3.5'}
    run_name_mapping = {'round-1': 'Run 1', 'round-2': 'Run 2'}

    def parse_xml_lines(file_path):
        try:
            tree = ET.parse(file_path)
            root = tree.getroot()
            lines = []
            for line_elem in root.findall('.//line'):
                lines.append({
                    'page': line_elem.get('page', ''),
                    'line': line_elem.get('line', ''),
                    'text': line_elem.text.strip() if line_elem.text else ""
                })
            return lines
        except ET.ParseError:
            st.warning(f"Could not parse XML file: {file_path}. Skipping.")
            return []

    # 1. Load originals
    for file_path in originals_path.glob("*.xml"):
        if file_path.name.endswith("_test_input.xml"):
            continue
        
        file_id = file_path.name
        match = re.match(r'(\d+)-(\d+)', file_id)
        lacuna_size_key = f"{match.group(1)}-{match.group(2)}" if match else "other"
        
        original_lines = parse_xml_lines(file_path)
        if original_lines:
            manuscripts[file_id] = Manuscript(file_id, lacuna_size_key, original_lines)

    # 2. Load reconstructions
    for recon_dir in data_path.iterdir():
        if recon_dir.is_dir() and recon_dir.name != "originals":
            try:
                model_key, run_key, run_num = recon_dir.name.split('-')
                model_name = model_name_mapping.get(model_key, model_key)
                run_name = run_name_mapping.get(f"{run_key}-{run_num}", f"{run_key}-{run_num}")
                full_model_name = f"{model_name} {run_name}"
            except ValueError:
                full_model_name = recon_dir.name

            for file_path in recon_dir.glob("*.xml"):
                if file_path.name in manuscripts:
                    original_manuscript = manuscripts[file_path.name]
                    # The reconstruction XML contains the full text
                    reconstruction_lines = parse_xml_lines(file_path)
                    if not reconstruction_lines:
                        continue
                    
                    # Compare with original to identify filled lines
                    highlighted_lines = []
                    for i, recon_line in enumerate(reconstruction_lines):
                        line_copy = recon_line.copy()
                        # A line is considered 'filled' if the original was empty but this one has text.
                        is_filled = (
                            i < len(original_manuscript.original_lines) and
                            not original_manuscript.original_lines[i]['text'] and
                            bool(line_copy['text'])
                        )
                        line_copy['is_filled'] = is_filled
                        highlighted_lines.append(line_copy)
                    
                    original_manuscript.add_reconstruction(full_model_name, highlighted_lines)

    return sorted(manuscripts.values(), key=lambda m: m.id)

# --- TRANSLATION FUNCTION ---
def translate_text(text_to_translate, api_key):
    """Translates text using the Gemini API with improved error handling."""
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash-latest')
        prompt = f"Translate the following Ancient Greek text to English. Provide only the English translation and nothing else:\n\n{text_to_translate}"
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        error_str = str(e)
        if "API_KEY_INVALID" in error_str or "API key not valid" in error_str:
            st.error("Translation failed: The provided API key is invalid. Please double-check it.")
        elif "permission" in error_str.lower() or "has not been used" in error_str.lower():
            st.error("Translation failed: The Generative Language API may not be enabled for your project, or you may have a billing issue.")
            st.info("To fix this, please enable the API for your project in the Google Cloud Console.")
            st.markdown("[Click here to enable the Generative Language API](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com)")
        else:
            st.error(f"An unexpected error occurred during translation: {error_str}")
        return None

# --- UI COMPONENTS ---
def display_manuscript(manuscript, selected_models, api_key):
    """Renders a single manuscript and its selected reconstructions."""
    st.markdown(f"### Manuscript: `{manuscript.id}`")
    
    num_columns = 1 + len(selected_models)
    cols = st.columns(num_columns)

    def translation_popover(text_to_translate, source_name, button_key):
        # The popover content is now directly tied to the button
        with st.popover("Translate"):
            st.subheader(f"Translation of {source_name}")
            st.text_area("Original (Ancient Greek)", value=text_to_translate, height=150, key=f"orig_{button_key}")
            if not api_key:
                st.warning("Please enter your Google AI API key in the sidebar to enable translation.")
            else:
                with st.spinner("Translating..."):
                    translation_result = translate_text(text_to_translate, api_key)
                    if translation_result:
                        st.text_area("Translation (English)", value=translation_result, height=150, key=f"trans_{button_key}")

    # Display Original
    with cols[0]:
        st.subheader("Original")
        for line in manuscript.original_lines:
            text = line['text'] if line['text'] else "..."
            st.markdown(f"<span style='font-family: monospace; color: #888;'>{line['page']}:{line['line']}</span> &nbsp; {text}", unsafe_allow_html=True)
        
        original_text = manuscript.get_full_text()
        translation_popover(original_text, "Original", f"popover_orig_{manuscript.id}")

    # Display Reconstructions
    for i, model_name in enumerate(selected_models):
        with cols[i+1]:
            st.subheader(model_name)
            if model_name in manuscript.reconstructions:
                for line in manuscript.reconstructions[model_name]:
                    text = line['text'] if line['text'] else "..."
                    bg_color = "background-color: #FFFBEA;" if line.get('is_filled') else ""
                    st.markdown(f"<p style='{bg_color} margin-bottom: 0;'><span style='font-family: monospace; color: #888;'>{line['page']}:{line['line']}</span> &nbsp; <span style='color: #333;'>{text}</span></p>", unsafe_allow_html=True)
                
                recon_text = manuscript.get_full_text(model_name)
                translation_popover(recon_text, model_name, f"popover_{model_name}_{manuscript.id}")
            else:
                st.warning("No reconstruction available.")
    
    st.markdown("---")


# --- MAIN APP LOGIC ---

# --- Header ---
st.title("📖 The Virtual Mani")
st.markdown("An AI-Assisted Manuscript Reconstruction Comparator")

with st.expander("About This Project", expanded=True):
    st.markdown("""
    This application serves as an interactive tool for the philological study of fragmentary texts, using the Cologne Mani Codex (CMC) as a primary case study. It allows for the systematic evaluation of Large Language Models (LLMs), such as GPT-4o, Gemini 1.5, and Claude Sonnet 3.5, in the complex task of textual reconstruction.

    Users see reconstructions by LLMs of missing sections (lacunae) as they appear in the edition from Koenen & Römer (1988) and can compare the completions side-by-side. The goal is to situate these powerful new technologies within traditional scholarly workflows, highlighting not only their potential to propose plausible reconstructions but also the epistemological risks they pose, such as grammatical misalignments or the 'hallucination' of historically incongruous content. This tool is designed to support the critical human oversight essential for integrating AI into the interpretation of historical texts, fostering a more transparent, reproducible, and critically aware digital philology.
    
    Upon providing an API key for any other LLM, users have the opportunity to translate a specific reconstruction to English.
                
    For more details, please see the paper (TBD)-
    
    Contact: Phillip B. Ströbel (phillip.stroebel@uzh.ch)
    
    """)

# --- Sidebar Controls ---
st.sidebar.header("Controls")
data_directory = st.sidebar.text_input("Enter Path to Data Directory", "./data")
api_key = st.sidebar.text_input("Google AI API Key", type="password", help="Get your key from Google AI Studio. The 'Generative Language API' must be enabled for your project.")

# --- Main Content Area ---
try:
    all_manuscripts = load_data(data_directory)
except FileNotFoundError as e:
    st.error(str(e))
    st.stop()
    
if not all_manuscripts:
    st.warning(f"No valid manuscript files found in '{data_directory}'. Please check your folder structure.")
    st.info("""
    **Expected Folder Structure:**
    ```
    - data/
        |- originals/
        |   |- 1-4_1.1.xml
        |   |- ...
        |- claude-round-1/
        |   |- 1-4_1.1.xml
        |   |- ...
        |- gpt-round-2/
        |   |- 1-4_1.1.xml
        |   |- ...
    ```
    """)
    st.stop()

all_models = sorted(list(set(model for ms in all_manuscripts for model in ms.reconstructions.keys())))
lacuna_sizes = ["All"] + sorted(list(set(ms.lacuna_size for ms in all_manuscripts)))

selected_lacuna_size = st.sidebar.selectbox("Filter by Lacuna Size", options=lacuna_sizes)
selected_models_to_show = st.sidebar.multiselect("Select Reconstructions to Display", options=all_models, default=all_models)

if selected_lacuna_size == "All":
    filtered_manuscripts = all_manuscripts
else:
    filtered_manuscripts = [ms for ms in all_manuscripts if ms.lacuna_size == selected_lacuna_size]

if not filtered_manuscripts:
    st.warning("No manuscripts match the current filter.")
else:
    st.info(f"Displaying **{len(filtered_manuscripts)}** manuscript(s).")
    for ms in filtered_manuscripts:
        display_manuscript(ms, selected_models_to_show, api_key)

