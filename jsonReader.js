function fillData() {
    const data = new Map();
    data.set("User 1", ["User 2", "User 3", "User 4"]);
    data.set("User 2", ["User 1", "User 3"]);
    data.set("User 3", ["User 1", "User 2", "User 4", "User 5", "User 6", "User 7"]);
    data.set("User 4", ["User 1", "User 3", "User 5", "User 6", "User 7", "User 8"]);
    data.set("User 5", ["User 3", "User 4", "User 6", "User 7", "User 8"]);
    data.set("User 6", ["User 3", "User 4", "User 5", "User 7", "User 8"]);
    data.set("User 7", ["User 3", "User 4", "User 5", "User 6", "User 8"]);
    data.set("User 8", ["User 5", "User 6", "User 7"]);
    data.set("User 9", ["User 5", "User 6", "User 7"]);
    return data;
}

// Function to convert the map to an array of objects
function mapToArray(dataMap) {
    const dataArray = [];
    const nodeNames = Array.from(dataMap.keys());

    nodeNames.forEach((name, index) => {
        const connections = dataMap.get(name).map(targetName => nodeNames.indexOf(targetName));
        dataArray.push({ name, connections });
    });

    return dataArray;
}

// Generate the data
const dataMap = fillData();
const data = mapToArray(dataMap);
console.log("Data read from file:", data);
