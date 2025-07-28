import React, { useState, useEffect, useMemo } from 'react';
import { ChevronsUpDown, Check, X, BookOpen, Book, Loader } from 'lucide-react';

// --- MODEL & RUN NAME MAPPINGS ---
// This configuration remains to map folder names to display names.
const modelNameMapping = {
    'gpt': 'GPT-4o',
    'gemini': 'Gemini 1.5',
    'claude': 'Claude Sonnet 3.5'
};

const runNameMapping = {
    'round-1': 'Run 1',
    'round-2': 'Run 2'
};


// --- API FUNCTIONS ---
// These functions make network requests to your own backend server.
const fetchDataFromApi = async () => {
  // This function fetches the manuscript data from our backend's API endpoint.
  // The backend reads the data from the mounted /data directory.
  const apiUrl = `${window.location.origin}/api/manuscripts`;
  console.log(`Fetching manuscript data from backend at: ${apiUrl}`);
  const response = await fetch(apiUrl);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch manuscript data: ${response.statusText} - ${errorText}`);
  }
  const data = await response.json();
  console.log("Manuscript data fetched successfully.");
  return data;
};

const translateTextViaApi = async (textToTranslate) => {
    // This function sends text to our backend's translation endpoint.
    // The backend securely handles the API key and calls the Google AI service.
    const apiUrl = `${window.location.origin}/api/translate`;
    console.log(`Sending text to backend for translation at: ${apiUrl}`);
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: textToTranslate }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Translation request failed: ${response.statusText} - ${errorText}`);
    }
    const data = await response.json();
    console.log("Translation received from backend.");
    return data.translation;
};


// --- UTILITY FUNCTIONS ---
const parseXML = (xmlString, isReconstruction = false) => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const lines = Array.from(xmlDoc.getElementsByTagName("line")).map(line => ({
    page: line.getAttribute("page"),
    line: line.getAttribute("line"),
    text: line.textContent.trim()
  }));
  if (isReconstruction) {
      return lines.filter(l => l.text);
  }
  return lines;
};

const getLacunaSize = (fileName) => {
  const match = fileName.match(/^(\d+)-(\d+)/);
  if (!match) return 'unknown';
  const start = parseInt(match[1], 10);
  if (start >= 1 && start <= 4) return '1-4';
  if (start >= 5 && start <= 8) return '5-8';
  if (start >= 9 && start <= 12) return '9-12';
  return 'other';
};


// --- REACT COMPONENTS ---

const Header = () => (
  <header className="bg-gray-800 text-white p-4 shadow-md">
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold tracking-tight">The Virtual Mani</h1>
      <p className="text-gray-300">An AI-Assisted Manuscript Reconstruction Comparator</p>
    </div>
  </header>
);

const Introduction = () => {
    const [isOpen, setIsOpen] = useState(true);
    const introText = "This application serves as an interactive tool for the philological study of fragmentary texts, using the Cologne Mani Codex (CMC) as a primary case study. It allows for the systematic evaluation of Large Language Models (LLMs)—such as GPT-4o, Gemini 1.5, and Claude Sonnet 3.5—in the complex task of textual reconstruction. Users can load manuscripts with missing sections (lacunae) and compare various AI-generated completions side-by-side. The goal is to situate these powerful new technologies within traditional scholarly workflows, highlighting not only their potential to propose plausible reconstructions but also the epistemological risks they pose, such as grammatical misalignments or the 'hallucination' of historically incongruous content. This tool is designed to support the critical human oversight essential for integrating AI into the interpretation of historical texts, fostering a more transparent, reproducible, and critically aware digital philology.";

    return (
        <div className="bg-white p-4 rounded-lg shadow-md mb-6">
            <button onClick={() => setIsOpen(!isOpen)} className="flex items-center justify-between w-full text-left font-bold text-lg text-gray-700">
                About This Project
                {isOpen ? <Book size={20} /> : <BookOpen size={20} />}
            </button>
            {isOpen && (
                <div className="mt-4 text-gray-600 border-t pt-4">
                    <p className="text-justify">{introText}</p>
                </div>
            )}
        </div>
    );
};


const FilterControls = ({ lacunaFilter, setLacunaFilter, reconstructionModels, selectedModels, toggleModel }) => {
  const lacunaOptions = ['all', '1-4', '5-8', '9-12'];

  return (
    <div className="bg-white p-4 rounded-lg shadow-md mb-6 sticky top-0 z-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="lacuna-filter" className="block text-sm font-medium text-gray-700 mb-1">Filter by Lacuna Size</label>
          <select id="lacuna-filter" value={lacunaFilter} onChange={(e) => setLacunaFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
            {lacunaOptions.map(opt => <option key={opt} value={opt}>{opt === 'all' ? 'Show All' : `${opt} lines`}</option>)}
          </select>
        </div>
        <div>
          <span className="block text-sm font-medium text-gray-700 mb-1">Select Reconstructions</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
            {reconstructionModels.map(model => (
              <label key={model} className="flex items-center space-x-2 cursor-pointer p-1 rounded-md hover:bg-gray-100">
                <input type="checkbox" checked={selectedModels.includes(model)} onChange={() => toggleModel(model)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"/>
                <span className="text-gray-700 text-sm">{model}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const ManuscriptView = ({ title, lines, onTranslate }) => {
  const textContent = lines.map(l => l.text || '[...]').join('\n');

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full">
      <div className="p-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <h3 className="font-bold text-gray-800">{title}</h3>
      </div>
      <div className="p-4 font-mono text-sm text-gray-700 overflow-y-auto flex-grow">
        {lines.map((line, index) => (
            <p key={`${line.page}-${line.line}-${index}`} className={`flex items-start ${line.isFilled ? 'bg-yellow-100 text-yellow-900 rounded px-1' : ''}`}>
              <span className="text-gray-400 mr-3 w-12 text-right select-none">{line.page}:{line.line}</span>
              <span className="flex-1">{line.text || <span className="text-gray-400">[...]</span>}</span>
            </p>
        ))}
      </div>
      <div className="p-2 border-t border-gray-200 bg-gray-50 rounded-b-lg">
        <button onClick={() => onTranslate(textContent, title)} className="w-full bg-indigo-600 text-white px-3 py-1.5 text-sm rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors">Translate</button>
      </div>
    </div>
  );
};

const ComparisonCard = ({ manuscript, selectedModels, onTranslate }) => {
    const visibleModels = selectedModels.filter(model => manuscript.reconstructions[model]);
    const gridCols = `grid-cols-1 md:grid-cols-2 lg:grid-cols-${Math.min(visibleModels.length + 1, 4)}`;

    return (
        <div className="bg-gray-100 p-6 rounded-xl shadow-lg mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-indigo-200">Manuscript: <span className="font-mono">{manuscript.id}</span></h2>
            <div className={`grid gap-6 ${gridCols}`}>
                <ManuscriptView title="Original" lines={manuscript.original} onTranslate={onTranslate} />
                {visibleModels.map(model => (
                    <ManuscriptView key={model} title={model} lines={manuscript.reconstructions[model]} onTranslate={onTranslate} />
                ))}
            </div>
        </div>
    );
};

const TranslationModal = ({ isOpen, onClose, originalText, translatedText, isLoading, sourceTitle }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center"><h2 className="text-lg font-bold text-gray-800">Translation of "{sourceTitle}"</h2><button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X size={24} /></button></div>
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          <div><h3 className="font-semibold text-gray-700 mb-2">Original (Ancient Greek)</h3><div className="bg-gray-100 p-3 rounded-md font-mono text-sm text-gray-600 whitespace-pre-wrap max-h-80 overflow-y-auto">{originalText}</div></div>
          <div><h3 className="font-semibold text-gray-700 mb-2">Translation (English)</h3><div className="bg-blue-50 p-3 rounded-md text-sm text-gray-800 min-h-[10rem] max-h-80 overflow-y-auto">{isLoading ? <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div> : <p className="whitespace-pre-wrap">{translatedText}</p>}</div></div>
        </div>
        <div className="p-4 border-t bg-gray-50 text-right"><button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Close</button></div>
      </div>
    </div>
  );
};

const LoadingSpinner = () => (
    <div className="flex flex-col items-center justify-center h-80">
        <Loader className="w-12 h-12 animate-spin text-indigo-600" />
        <p className="mt-4 text-gray-600">Loading Manuscripts...</p>
    </div>
);

// --- MAIN APP COMPONENT ---
export default function App() {
  const [manuscripts, setManuscripts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lacunaFilter, setLacunaFilter] = useState('all');
  const [reconstructionModels, setReconstructionModels] = useState([]);
  const [selectedModels, setSelectedModels] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [translationSource, setTranslationSource] = useState({ text: '', title: ''});
  const [translatedText, setTranslatedText] = useState('');
  const [isLoadingTranslation, setIsLoadingTranslation] = useState(false);

  // Data Loading and Processing Effect
  useEffect(() => {
    const loadAndProcessData = async () => {
        try {
            const fileSystemData = await fetchDataFromApi();
            
            const loadedModels = new Set();
            const originalFiles = Object.keys(fileSystemData.originals)
                .filter(fileName => !fileName.endsWith('_test_input.xml'));

            const loadedData = originalFiles.map(fileName => {
              const originalXML = fileSystemData.originals[fileName];
              const originalLines = parseXML(originalXML);
              const reconstructions = {};

              for (const folderName in fileSystemData.reconstructions) {
                  if (fileSystemData.reconstructions[folderName][fileName]) {
                      const parts = folderName.split('-');
                      const modelKey = parts[0];
                      const runKey = parts.slice(1).join('-');
                      const modelName = modelNameMapping[modelKey] || modelKey;
                      const runName = runNameMapping[runKey] || runKey;
                      const fullModelName = `${modelName} ${runName}`;
                      loadedModels.add(fullModelName);
                      
                      const reconstructionXML = fileSystemData.reconstructions[folderName][fileName];
                      const reconstructionLines = parseXML(reconstructionXML, true);
                      
                      let currentReconLine = 0;
                      const combinedLines = originalLines.map(line => {
                          if (!line.text && reconstructionLines[currentReconLine]) {
                              const filledLine = { ...reconstructionLines[currentReconLine], isFilled: true };
                              currentReconLine++;
                              return filledLine;
                          }
                          return {...line, isFilled: false};
                      });
                      reconstructions[fullModelName] = combinedLines;
                  }
              }
              return { id: fileName, lacunaSize: getLacunaSize(fileName), original: originalLines, reconstructions: reconstructions };
            });

            const allModels = Array.from(loadedModels).sort();
            setManuscripts(loadedData);
            setReconstructionModels(allModels);
            setSelectedModels(allModels);
        } catch (err) {
            setError(err.message);
            console.error("Failed to load manuscript data:", err);
        } finally {
            setIsLoading(false);
        }
    };
    loadAndProcessData();
  }, []);

  const toggleModel = (model) => {
    setSelectedModels(prev =>
      prev.includes(model) ? prev.filter(m => m !== model) : [...prev, model]
    );
  };

  const filteredManuscripts = useMemo(() => {
    if (lacunaFilter === 'all') return manuscripts;
    return manuscripts.filter(m => m.lacunaSize === lacunaFilter);
  }, [manuscripts, lacunaFilter]);

  const handleTranslate = async (text, title) => {
    setTranslationSource({ text, title });
    setIsModalOpen(true);
    setIsLoadingTranslation(true);
    setTranslatedText('');
    try {
        const translation = await translateTextViaApi(text);
        setTranslatedText(translation);
    } catch (err) {
        setTranslatedText(`Error: ${err.message}`);
    } finally {
        setIsLoadingTranslation(false);
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen font-sans">
      <Header />
      <main className="container mx-auto p-4 md:p-6">
        <Introduction />
        {isLoading ? (
            <LoadingSpinner />
        ) : error ? (
            <div className="text-center py-16 text-red-600 bg-red-50 p-4 rounded-lg">
                <h3 className="font-bold">Failed to load manuscript data</h3>
                <p className="mt-2 font-mono text-sm">{error}</p>
            </div>
        ) : (
          <>
            <FilterControls
              lacunaFilter={lacunaFilter}
              setLacunaFilter={setLacunaFilter}
              reconstructionModels={reconstructionModels}
              selectedModels={selectedModels}
              toggleModel={toggleModel}
            />
            {filteredManuscripts.length > 0 ? (
              filteredManuscripts.map(ms => (
                <ComparisonCard key={ms.id} manuscript={ms} selectedModels={selectedModels} onTranslate={handleTranslate}/>
              ))
            ) : (
              <div className="text-center py-16"><p className="text-gray-500">No manuscripts match the current filter.</p></div>
            )}
          </>
        )}
      </main>
      <TranslationModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} originalText={translationSource.text} translatedText={translatedText} isLoading={isLoadingTranslation} sourceTitle={translationSource.title}/>
    </div>
  );
}

