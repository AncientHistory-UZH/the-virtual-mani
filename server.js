const express = require('express');
const path = require('path');
const { Storage } = require('@google-cloud/storage');

const app = express();
app.use(express.json());
const port = process.env.PORT || 8080;

// Initialize Google Cloud Storage
const storage = new Storage();
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'the-virtual-mani'; // Set this in Cloud Run environment variables

console.log('Server starting...');
console.log('GCS Bucket Name:', BUCKET_NAME);

// Function to read manuscript data from GCS bucket
async function getManuscriptData() {
    const fileSystemData = { originals: {}, reconstructions: {} };
    
    try {
        const bucket = storage.bucket(BUCKET_NAME);
        
        // List all files in the bucket
        const [files] = await bucket.getFiles();
        console.log(`Found ${files.length} files in bucket ${BUCKET_NAME}`);
        
        // Process each file
        for (const file of files) {
            const fileName = file.name;
            
            // Skip non-XML files and test input files
            if (!fileName.endsWith('.xml') || fileName.endsWith('_test_input.xml')) {
                continue;
            }
            
            // Parse the file path to determine folder structure
            const pathParts = fileName.split('/');
            
            if (pathParts.length < 2) {
                console.log(`Skipping file with unexpected path structure: ${fileName}`);
                continue;
            }
            
            const folderName = pathParts[0];
            const baseFileName = pathParts[pathParts.length - 1];
            
            // Download file content
            console.log(`Reading file: ${fileName}`);
            const [contents] = await file.download();
            const content = contents.toString('utf8');
            
            // Organize data based on folder structure
            if (folderName === 'originals') {
                fileSystemData.originals[baseFileName] = content;
            } else {
                // It's a reconstruction folder
                if (!fileSystemData.reconstructions[folderName]) {
                    fileSystemData.reconstructions[folderName] = {};
                }
                fileSystemData.reconstructions[folderName][baseFileName] = content;
            }
        }
        
        console.log(`Loaded ${Object.keys(fileSystemData.originals).length} original files`);
        console.log(`Loaded reconstructions from ${Object.keys(fileSystemData.reconstructions).length} folders`);
        
        return fileSystemData;
        
    } catch (error) {
        console.error('Error reading from GCS bucket:', error);
        throw error;
    }
}

// API endpoint for fetching manuscript data
app.get('/api/manuscripts', async (req, res) => {
    try {
        const data = await getManuscriptData();
        if (Object.keys(data.originals).length === 0) {
            console.warn("Warning: No original manuscripts found in the bucket.");
        }
        res.json(data);
    } catch (error) {
        console.error('--- DETAILED SERVER ERROR ---');
        console.error(error);
        
        // Provide more specific error messages
        if (error.code === 404) {
            res.status(500).json({ 
                error: `Bucket '${BUCKET_NAME}' not found. Please check the bucket name and permissions.` 
            });
        } else if (error.code === 403) {
            res.status(500).json({ 
                error: 'Permission denied. Please check that the service account has access to the bucket.' 
            });
        } else {
            res.status(500).json({ 
                error: `Failed to retrieve manuscript data: ${error.message}` 
            });
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
