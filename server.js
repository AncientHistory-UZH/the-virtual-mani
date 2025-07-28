const express = require('express');
const { Storage } = require('@google-cloud/storage');
const { VertexAI } = require('@google-cloud/aiplatform');
const path = require('path');

const app = express();
app.use(express.json()); // Middleware to parse JSON bodies
const port = process.env.PORT || 8080;

// --- Cloud Storage Configuration ---
const storage = new Storage();
const BUCKET_NAME = 'the-virtual-mani'; // <-- IMPORTANT: Make sure this is correct

// --- Vertex AI (Translation) Configuration ---
const project = process.env.GCLOUD_PROJECT; // Automatically gets project ID from environment
const location = 'us-central1';
const vertexAI = new VertexAI({ project, location });
const generativeModel = vertexAI.getGenerativeModel({
  model: 'gemini-1.5-flash-001',
});

async function getCloudStorageData() {
    const fileSystemData = { originals: {}, reconstructions: {} };
    const [folders] = await storage.bucket(BUCKET_NAME).getFiles({ delimiter: '/' });

    for (const folder of folders.prefixes) {
        const folderName = folder.replace(/\/$/, '');
        if (!folderName) continue;

        const [files] = await storage.bucket(BUCKET_NAME).getFiles({ prefix: folder });
        for (const file of files) {
            if (file.name.endsWith('.xml') && !file.name.endsWith('_test_input.xml')) {
                const [content] = await file.download();
                const fileName = path.basename(file.name);
                if (folderName === 'originals') {
                    fileSystemData.originals[fileName] = content.toString('utf8');
                } else {
                    if (!fileSystemData.reconstructions[folderName]) {
                        fileSystemData.reconstructions[folderName] = {};
                    }
                    fileSystemData.reconstructions[folderName][fileName] = content.toString('utf8');
                }
            }
        }
    }
    return fileSystemData;
}

// API endpoint for fetching manuscript data
app.get('/api/manuscripts', async (req, res) => {
    try {
        const data = await getCloudStorageData();
        res.json(data);
    } catch (error) {
        console.error('Error fetching data from GCS:', error);
        res.status(500).send('Failed to retrieve manuscript data.');
    }
});

// API endpoint for handling translations
app.post('/api/translate', async (req, res) => {
    try {
        const textToTranslate = req.body.text;
        if (!textToTranslate) {
            return res.status(400).json({ error: 'No text provided for translation.' });
        }
        
        const prompt = `Translate the following Ancient Greek text to English. Provide only the English translation and nothing else:\n\n${textToTranslate}`;
        const [result] = await generativeModel.generateContent([prompt]);
        const translation = result.response.candidates[0].content.parts[0].text;
        
        res.json({ translation });
    } catch (error) {
        console.error('Error during translation:', error);
        res.status(500).send('Failed to translate text.');
    }
});

// Serve the built React app
app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
