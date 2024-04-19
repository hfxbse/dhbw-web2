import { readFileSync } from 'fs';
import path from 'path';

// Function to read data from JSON file and convert to array of objects
export function readDataFromFile() {
    try {
        const jsonData = JSON.parse(readFileSync(filename, 'utf-8'));
        const dataArray = [];

        // Iterate through each key-value pair in the JSON data
        Object.keys(jsonData).forEach(name => {
            const connections = jsonData[name].map(targetName => Object.keys(jsonData).indexOf(targetName));
            dataArray.push({ name, connections });
        });

        return dataArray;
    } catch (error) {
        console.error(`Error reading data from ${filename}: ${error.message}`);
        return null;
    }
}

// Get the directory name of the current module
const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Get the absolute path of data.json using path.join
const filename = path.join(__dirname.slice(3), 'data.json');

// Test reading data from JSON file and converting to array of objects
const data = readDataFromFile(filename);
console.log("Data read from file:", data);
