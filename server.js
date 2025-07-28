const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { VertexAI } = require('@google-cloud/aiplatform');

const app = express();
app.use(express.json());
const port = process.env.PORT || 8080;

// This is the path where the Cloud Storage bucket is mounted inside the container.
const DATA_PATH = '/data';

// Vertex AI (Translation) Configuration
const project = process.env.GCLOUD_PROJECT;
const location = 'us-central1';
const vertexAI = new VertexAI({ project, location });
const generativeModel = vertexAI.getGenerativeModel({
  model: 'gemini-1.5-flash-001',
});

async function getManuscriptData() {
    const fileSystemData = { originals: {}, reconstructions: {} };
    const topLevelFolders = await fs.readdir(DATA_PATH);

    for (const folderName of topLevelFolders) {
        const folderPath = path.join(DATA_PATH, folderName);
        const stats = await fs.stat(folderPath);
        if (!stats.isDirectory()) continue;

        const files = await fs.readdir(folderPath);
        for (const fileName of files) {
            if (fileName.endsWith('.xml') && !fileName.endsWith('_test_input.xml')) {
                const filePath = path.join(folderPath, fileName);
                const content = await fs.readFile(filePath, 'utf8');

                if (folderName === 'originals') {
                    fileSystemData.originals[fileName] = content;
                } else {
                    if (!fileSystemData.reconstructions[folderName]) {
                        fileSystemData.reconstructions[folderName] = {};
                    }
                    fileSystemData.reconstructions[folderName][fileName] = content;
                }
            }
        }
    }
    return fileSystemData;
}

// API endpoint for fetching manuscript data
app.get('/api/manuscripts', async (req, res) => {
    try {
        const data = await getManuscriptData();
        res.json(data);
    } catch (error) {
        console.error('Error reading manuscript data from filesystem:', error);
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

