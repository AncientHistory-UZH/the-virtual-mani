const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
app.use(express.json());
const port = process.env.PORT || 8080;

// This is the path where the Cloud Storage bucket is mounted inside the container.
const DATA_PATH = '/data';

// This function now reads from the local filesystem at /data
async function getManuscriptData() {
    const fileSystemData = { originals: {}, reconstructions: {} };

    // The check for the directory is now implicitly handled by fs.readdir.
    // If it fails, the catch block in the API handler will report it.
    const topLevelItems = await fs.readdir(DATA_PATH);
    console.log(`Found top-level items in /data: ${topLevelItems.join(', ')}`);

    for (const folderName of topLevelItems) {
        const folderPath = path.join(DATA_PATH, folderName);
        const stats = await fs.stat(folderPath);
        if (!stats.isDirectory()) {
            console.log(`Skipping item '${folderName}' because it is not a directory.`);
            continue;
        }

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
        if (Object.keys(data.originals).length === 0) {
            console.warn("Warning: Manuscript data was read successfully, but the 'originals' directory appears to be empty or contain no valid .xml files.");
        }
        res.json(data);
    } catch (error) {
        console.error('--- DETAILED SERVER ERROR ---');
        // Provide a more specific error if the directory doesn't exist
        if (error.code === 'ENOENT') {
            const detailedError = new Error(`Server configuration error: The data directory does not exist at path '${DATA_PATH}'. Please verify the volume mount.`);
            console.error(detailedError);
            res.status(500).send(`Failed to retrieve manuscript data. Server-side error: ${detailedError.message}`);
        } else {
            console.error(error);
            res.status(500).send(`Failed to retrieve manuscript data. Server-side error: ${error.message}`);
        }
    }
});

// API endpoint for handling translations
app.post('/api/translate', async (req, res) => {
    // Return a 503 Service Unavailable error as Vertex AI is disabled.
    res.status(503).json({ 
        error: 'Translation service is not available.' 
    });
});

// Serve the built React app
app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
