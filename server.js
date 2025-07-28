const express = require('express');
const { Storage } = require('@google-cloud/storage');
const path = require('path');

const app = express();
const port = process.env.PORT || 8080;
const storage = new Storage();

// IMPORTANT: Replace with your actual bucket name
const BUCKET_NAME = 'the-virtual-mani';

async function getCloudStorageData() {
    const fileSystemData = {
        originals: {},
        reconstructions: {}
    };

    const [folders] = await storage.bucket(BUCKET_NAME).getFiles({ delimiter: '/' });

    for (const folder of folders) {
        const folderName = folder.name.replace(/\/$/, ''); // e.g., 'claude-round-1' or 'originals'
        if (!folderName) continue;

        const [files] = await storage.bucket(BUCKET_NAME).getFiles({ prefix: folder.name });

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

// API endpoint for the frontend to fetch data
app.get('/api/manuscripts', async (req, res) => {
    try {
        const data = await getCloudStorageData();
        res.json(data);
    } catch (error) {
        console.error('Error fetching data from GCS:', error);
        res.status(500).send('Failed to retrieve manuscript data.');
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
