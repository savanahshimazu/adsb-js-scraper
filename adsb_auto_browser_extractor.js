// ADS-B Exchange Automated Data Extractor (Fixed Downloads)
// This script runs at set intervals to automatically extract and download data

(function() {
    // Configuration options - you can adjust these
    const config = {
        // How often to extract data (in milliseconds)
        intervalMinutes: 5,
        // Maximum number of extractions (0 for unlimited)
        maxExtractions: 0,
        // Auto-download format (csv, json, both, or none)
        autoDownload: 'both',
        // Show UI controls
        showControls: true,
        // Show notifications when extraction runs
        showNotifications: true,
        // Keep last N extractions in memory (0 for unlimited)
        keepLastN: 10
    };

    // Storage for extracted data
    const extractionHistory = [];
    let extractionCount = 0;
    let extractionInterval = null;
    
    // Function to convert data to CSV
    function convertToCSV(objArray) {
        const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
        if (!array || array.length === 0) return '';
        
        let csv = '';
        
        // Add headers
        const headers = Object.keys(array[0]);
        csv += headers.join(',') + '\r\n';
        
        // Add rows
        for (let i = 0; i < array.length; i++) {
            let line = '';
            for (const index in headers) {
                if (line !== '') line += ',';
                let value = array[i][headers[index]];
                // Handle commas and quotes in values
                if (value !== undefined && value !== null) {
                    value = value.toString().replace(/"/g, '""');
                    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                        value = `"${value}"`;
                    }
                } else {
                    value = '';
                }
                line += value;
            }
            csv += line + '\r\n';
        }
        return csv;
    }

    // Function to download data as a file
    function downloadData(data, filename, type) {
        const blob = new Blob([data], { type });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', filename);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        console.log(`File downloaded: ${filename}`);
        
        // Show notification if enabled
        if (config.showNotifications) {
            showNotification(`File downloaded: ${filename}`);
        }
    }

    // Function to extract table data
    function extractTableData() {
        console.log("Starting extraction of ADS-B Exchange data...");

        // Create a timestamp
        const extractionTimestamp = new Date().toISOString();

        // Get the table and headers
        const table = document.getElementById('planesTable');
        if (!table) {
            console.error("Could not find the planes table. Make sure you're on the correct page.");
            return null;
        }

        // Get header cells
        const headerCells = table.querySelectorAll('thead td');
        const headers = [];
        headerCells.forEach(cell => {
            // Get the ID as column name
            let headerName = cell.id;
            // Clean up any non-breaking spaces and special characters
            headerName = headerName.replace(/&nbsp;/g, " ").trim();
            headers.push(headerName);
        });

        // Get data rows
        const rows = table.querySelectorAll('tbody tr');
        const aircraft_data = [];

        rows.forEach(row => {
            // Get ICAO from row ID
            const icao = row.id;
            const cells = row.querySelectorAll('td');

            // Skip if row doesn't have enough cells
            if (cells.length < headers.length) return;

            // Create data object with timestamp
            const aircraftInfo = { 
                icao, 
                timestamp: extractionTimestamp,
                extraction_time_local: new Date().toString(),
                extraction_time_utc: extractionTimestamp
            };

            // Process each cell
            cells.forEach((cell, idx) => {
                if (idx < headers.length) {
                    // For the flag column, extract country from image title if available
                    if (headers[idx] === 'flag' && cell.querySelector('img')) {
                        const img = cell.querySelector('img');
                        aircraftInfo['country'] = img.title || '';
                    } else {
                        aircraftInfo[headers[idx]] = cell.textContent.trim();
                    }
                }
            });

            // Add data to array
            aircraft_data.push(aircraftInfo);
        });

        console.log(`Extracted data for ${len(aircraft_data)} aircraft`);
        return aircraft_data;
    }

    // Main extraction function with download option
    function performExtraction(forceDownload = false) {
        // Create timestamp for data and filename
        const timestamp = new Date().toISOString();
        const fileTimestamp = timestamp.replace(/[:.]/g, "-");
        
        // Extract table data
        const aircraftData = extractTableData();
        if (!aircraftData || aircraftData.length === 0) {
            console.error("Failed to extract aircraft data or no aircraft found.");
            return null;
        }

        // Add metadata to the JSON 
        const dataWithMetadata = {
            meta: {
                timestamp: timestamp,
                extraction_time: timestamp,
                record_count: aircraftData.length,
                extraction_number: extractionCount + 1,
                source: "ADS-B Exchange",
                exported_by: "Browser Automated Extractor"
            },
            aircraft: aircraftData
        };

        // Update counters
        extractionCount++;

        // Store in history
        if (config.keepLastN === 0 || extractionHistory.length < config.keepLastN) {
            extractionHistory.push(dataWithMetadata);
        } else {
            extractionHistory.shift(); // Remove oldest
            extractionHistory.push(dataWithMetadata);
        }

        // Show notification
        if (config.showNotifications) {
            showNotification(`Extraction #${extractionCount} complete: ${aircraftData.length} aircraft`);
        }

        // Download files - always download on forceDownload or when autoDownload is set
        const shouldDownloadCSV = forceDownload || config.autoDownload === 'both' || config.autoDownload === 'csv';
        const shouldDownloadJSON = forceDownload || config.autoDownload === 'both' || config.autoDownload === 'json';
        
        if (shouldDownloadCSV) {
            const csv = convertToCSV(aircraftData);
            const csvFilename = `adsb_data_${fileTimestamp}_${extractionCount}.csv`;
            downloadData(csv, csvFilename, 'text/csv');
        }
        
        if (shouldDownloadJSON) {
            const json = JSON.stringify(dataWithMetadata, null, 2);
            const jsonFilename = `adsb_data_${fileTimestamp}_${extractionCount}.json`;
            downloadData(json, jsonFilename, 'application/json');
        }

        console.log(`Extraction #${extractionCount} complete: ${aircraftData.length} aircraft`);
        
        // Check if we've reached maximum extractions
        if (config.maxExtractions > 0 && extractionCount >= config.maxExtractions) {
            stopAutomatedExtraction();
            showNotification(`Reached maximum of ${config.maxExtractions} extractions. Automation stopped.`);
        }
        
        return dataWithMetadata;
    }

    // Function to start automated extraction
    function startAutomatedExtraction() {
        if (extractionInterval) {
            console.log("Automated extraction already running.");
            return;
        }
        
        // Perform initial extraction
        performExtraction(true);
        
        // Set up interval for future extractions
        const intervalMs = config.intervalMinutes * 60 * 1000;
        extractionInterval = setInterval(() => {
            console.log(`Running scheduled extraction #${extractionCount + 1}`);
            performExtraction(true); // Force download on each scheduled extraction
        }, intervalMs);
        
        console.log(`Automated extraction started. Interval: ${config.intervalMinutes} minutes`);
        
        if (config.showNotifications) {
            showNotification(`Automated extraction started. Interval: ${config.intervalMinutes} minutes`);
        }
        
        // Update UI if it exists
        const startButton = document.getElementById('adsbx-auto-start');
        const stopButton = document.getElementById('adsbx-auto-stop');
        if (startButton && stopButton) {
            startButton.disabled = true;
            stopButton.disabled = false;
        }
        
        // Update status display
        updateStatusDisplay();
    }

    // Function to stop automated extraction
    function stopAutomatedExtraction() {
        if (extractionInterval) {
            clearInterval(extractionInterval);
            extractionInterval = null;
            console.log("Automated extraction stopped.");
            
            if (config.showNotifications) {
                showNotification("Automated extraction stopped.");
            }
            
            // Update UI if it exists
            const startButton = document.getElementById('adsbx-auto-start');
            const stopButton = document.getElementById('adsbx-auto-stop');
            if (startButton && stopButton) {
                startButton.disabled = false;
                stopButton.disabled = true;
            }
            
            // Update status display
            updateStatusDisplay();
        }
    }

    // Function to update status display
    function updateStatusDisplay() {
        const statusDiv = document.getElementById('adsbx-auto-status');
        const countDiv = document.getElementById('adsbx-auto-count');
        
        if (statusDiv) {
            statusDiv.innerHTML = extractionInterval 
                ? '<b>Status:</b> Running' 
                : '<b>Status:</b> Stopped';
        }
        
        if (countDiv) {
            countDiv.innerHTML = `<b>Extractions:</b> ${extractionCount}`;
        }
    }

    // Function to show notification
    function showNotification(message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.right = '20px';
        notification.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        notification.style.color = 'white';
        notification.style.padding = '10px 15px';
        notification.style.borderRadius = '5px';
        notification.style.zIndex = '10000';
        notification.style.transition = 'opacity 0.5s';
        notification.style.opacity = '0';
        notification.textContent = message;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Fade in
        setTimeout(() => {
            notification.style.opacity = '1';
        }, 10);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 500);
        }, 3000);
    }

    // Function to create the control panel
    function createControlPanel() {
        const controlPanel = document.createElement('div');
        controlPanel.id = 'adsbx-auto-controls';
        controlPanel.style.position = 'fixed';
        controlPanel.style.top = '10px';
        controlPanel.style.right = '10px';
        controlPanel.style.zIndex = '10000';
        controlPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        controlPanel.style.color = 'white';
        controlPanel.style.padding = '15px';
        controlPanel.style.borderRadius = '5px';
        controlPanel.style.width = '300px';
        controlPanel.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        
        // Add title
        const title = document.createElement('h3');
        title.textContent = 'ADS-B Exchange Auto Extractor';
        title.style.margin = '0 0 10px 0';
        title.style.textAlign = 'center';
        controlPanel.appendChild(title);
        
        // Add status display
        const statusDiv = document.createElement('div');
        statusDiv.id = 'adsbx-auto-status';
        statusDiv.style.margin = '10px 0';
        statusDiv.style.padding = '5px';
        statusDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
        statusDiv.style.borderRadius = '3px';
        statusDiv.innerHTML = '<b>Status:</b> Ready';
        controlPanel.appendChild(statusDiv);
        
        // Add extraction count
        const countDiv = document.createElement('div');
        countDiv.id = 'adsbx-auto-count';
        countDiv.style.margin = '10px 0';
        countDiv.innerHTML = '<b>Extractions:</b> 0';
        controlPanel.appendChild(countDiv);
        
        // Add config display
        const configDiv = document.createElement('div');
        configDiv.style.margin = '10px 0';
        configDiv.style.fontSize = '12px';
        configDiv.innerHTML = `
            <b>Configuration:</b><br>
            Interval: ${config.intervalMinutes} minutes<br>
            Max extractions: ${config.maxExtractions > 0 ? config.maxExtractions : 'Unlimited'}<br>
            Auto-download: ${config.autoDownload}<br>
        `;
        controlPanel.appendChild(configDiv);
        
        // Add interval control
        const intervalDiv = document.createElement('div');
        intervalDiv.style.margin = '10px 0';
        
        const intervalLabel = document.createElement('label');
        intervalLabel.textContent = 'Interval (min): ';
        intervalLabel.htmlFor = 'adsbx-interval-input';
        intervalDiv.appendChild(intervalLabel);
        
        const intervalInput = document.createElement('input');
        intervalInput.id = 'adsbx-interval-input';
        intervalInput.type = 'number';
        intervalInput.min = '1';
        intervalInput.max = '60';
        intervalInput.value = config.intervalMinutes.toString();
        intervalInput.style.width = '50px';
        intervalInput.addEventListener('change', () => {
            config.intervalMinutes = parseInt(intervalInput.value, 10);
            
            // Update the interval if it's running
            if (extractionInterval) {
                stopAutomatedExtraction();
                startAutomatedExtraction();
            }
            
            // Update config display
            configDiv.innerHTML = `
                <b>Configuration:</b><br>
                Interval: ${config.intervalMinutes} minutes<br>
                Max extractions: ${config.maxExtractions > 0 ? config.maxExtractions : 'Unlimited'}<br>
                Auto-download: ${config.autoDownload}<br>
            `;
        });
        intervalDiv.appendChild(intervalInput);
        controlPanel.appendChild(intervalDiv);
        
        // Add max extractions control
        const maxDiv = document.createElement('div');
        maxDiv.style.margin = '10px 0';
        
        const maxLabel = document.createElement('label');
        maxLabel.textContent = 'Max extractions: ';
        maxLabel.htmlFor = 'adsbx-max-input';
        maxDiv.appendChild(maxLabel);
        
        const maxInput = document.createElement('input');
        maxInput.id = 'adsbx-max-input';
        maxInput.type = 'number';
        maxInput.min = '0';
        maxInput.value = config.maxExtractions.toString();
        maxInput.style.width = '50px';
        maxInput.addEventListener('change', () => {
            config.maxExtractions = parseInt(maxInput.value, 10);
            
            // Update config display
            configDiv.innerHTML = `
                <b>Configuration:</b><br>
                Interval: ${config.intervalMinutes} minutes<br>
                Max extractions: ${config.maxExtractions > 0 ? config.maxExtractions : 'Unlimited'}<br>
                Auto-download: ${config.autoDownload}<br>
            `;
        });
        maxDiv.appendChild(maxInput);
        controlPanel.appendChild(maxDiv);
        
        // Add download format control
        const formatDiv = document.createElement('div');
        formatDiv.style.margin = '10px 0';
        
        const formatLabel = document.createElement('label');
        formatLabel.textContent = 'Download format: ';
        formatLabel.htmlFor = 'adsbx-format-select';
        formatDiv.appendChild(formatLabel);
        
        const formatSelect = document.createElement('select');
        formatSelect.id = 'adsbx-format-select';
        formatSelect.innerHTML = `
            <option value="both" ${config.autoDownload === 'both' ? 'selected' : ''}>Both (CSV & JSON)</option>
            <option value="csv" ${config.autoDownload === 'csv' ? 'selected' : ''}>CSV only</option>
            <option value="json" ${config.autoDownload === 'json' ? 'selected' : ''}>JSON only</option>
            <option value="none" ${config.autoDownload === 'none' ? 'selected' : ''}>None (memory only)</option>
        `;
        formatSelect.addEventListener('change', () => {
            config.autoDownload = formatSelect.value;
            
            // Update config display
            configDiv.innerHTML = `
                <b>Configuration:</b><br>
                Interval: ${config.intervalMinutes} minutes<br>
                Max extractions: ${config.maxExtractions > 0 ? config.maxExtractions : 'Unlimited'}<br>
                Auto-download: ${config.autoDownload}<br>
            `;
        });
        formatDiv.appendChild(formatSelect);
        controlPanel.appendChild(formatDiv);
        
        // Add buttons
        const buttonDiv = document.createElement('div');
        buttonDiv.style.margin = '15px 0 5px 0';
        buttonDiv.style.textAlign = 'center';
        
        const startButton = document.createElement('button');
        startButton.id = 'adsbx-auto-start';
        startButton.textContent = 'Start';
        startButton.style.padding = '5px 15px';
        startButton.style.marginRight = '10px';
        startButton.style.cursor = 'pointer';
        startButton.addEventListener('click', startAutomatedExtraction);
        buttonDiv.appendChild(startButton);
        
        const stopButton = document.createElement('button');
        stopButton.id = 'adsbx-auto-stop';
        stopButton.textContent = 'Stop';
        stopButton.style.padding = '5px 15px';
        stopButton.style.cursor = 'pointer';
        stopButton.disabled = true;
        stopButton.addEventListener('click', stopAutomatedExtraction);
        buttonDiv.appendChild(stopButton);
        
        const extractNowButton = document.createElement('button');
        extractNowButton.id = 'adsbx-extract-now';
        extractNowButton.textContent = 'Extract Now';
        extractNowButton.style.padding = '5px 15px';
        extractNowButton.style.marginTop = '10px';
        extractNowButton.style.cursor = 'pointer';
        extractNowButton.addEventListener('click', () => performExtraction(true));
        buttonDiv.appendChild(document.createElement('br'));
        buttonDiv.appendChild(extractNowButton);
        
        controlPanel.appendChild(buttonDiv);
        
        // Add download history button
        const downloadHistoryButton = document.createElement('button');
        downloadHistoryButton.id = 'adsbx-download-history';
        downloadHistoryButton.textContent = 'Download History';
        downloadHistoryButton.style.padding = '5px 15px';
        downloadHistoryButton.style.marginTop = '10px';
        downloadHistoryButton.style.cursor = 'pointer';
        downloadHistoryButton.addEventListener('click', () => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const historyData = {
                meta: {
                    timestamp: new Date().toISOString(),
                    extraction_count: extractionCount,
                    history_count: extractionHistory.length
                },
                extractions: extractionHistory
            };
            const json = JSON.stringify(historyData, null, 2);
            downloadData(json, `adsb_history_${timestamp}.json`, 'application/json');
        });
        buttonDiv.appendChild(document.createElement('br'));
        buttonDiv.appendChild(downloadHistoryButton);
        
        // Add hide button
        const hideButton = document.createElement('button');
        hideButton.textContent = 'Hide';
        hideButton.style.position = 'absolute';
        hideButton.style.top = '5px';
        hideButton.style.right = '5px';
        hideButton.style.padding = '2px 5px';
        hideButton.style.fontSize = '10px';
        hideButton.style.cursor = 'pointer';
        hideButton.addEventListener('click', () => {
            controlPanel.style.display = 'none';
            
            // Create a show button
            const showButton = document.createElement('button');
            showButton.textContent = 'ADS-B Auto';
            showButton.style.position = 'fixed';
            showButton.style.top = '10px';
            showButton.style.right = '10px';
            showButton.style.zIndex = '10000';
            showButton.style.padding = '5px 10px';
            showButton.style.cursor = 'pointer';
            showButton.addEventListener('click', () => {
                controlPanel.style.display = 'block';
                document.body.removeChild(showButton);
            });
            document.body.appendChild(showButton);
        });
        controlPanel.appendChild(hideButton);
        
        // Set up update interval for status display
        setInterval(updateStatusDisplay, 1000);
        
        return controlPanel;
    }

    // Initialize the automated extractor
    function initializeAutomatedExtractor() {
        console.log("Initializing ADS-B Exchange Automated Extractor");
        
        // Create control panel if enabled
        if (config.showControls) {
            // Check if panel already exists
            let controlPanel = document.getElementById('adsbx-auto-controls');
            if (!controlPanel) {
                controlPanel = createControlPanel();
                document.body.appendChild(controlPanel);
            }
        }
        
        // Report that the script is ready
        console.log("ADS-B Exchange Automated Extractor initialized!");
        console.log("Configuration:", config);
        console.log("Available functions:");
        console.log("- window.adsbxAutoExtractor.start() - Start automated extraction");
        console.log("- window.adsbxAutoExtractor.stop() - Stop automated extraction");
        console.log("- window.adsbxAutoExtractor.extract() - Perform a single extraction");
        console.log("- window.adsbxAutoExtractor.getHistory() - Get extraction history");
        console.log("- window.adsbxAutoExtractor.clearHistory() - Clear extraction history");
        console.log("- window.adsbxAutoExtractor.downloadHistory() - Download all history as JSON");
        
        // Add to window for external access
        window.adsbxAutoExtractor = {
            start: startAutomatedExtraction,
            stop: stopAutomatedExtraction,
            extract: () => performExtraction(true),
            getHistory: () => extractionHistory,
            clearHistory: () => {
                extractionHistory.length = 0;
                console.log("Extraction history cleared");
            },
            downloadHistory: () => {
                const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                const historyData = {
                    meta: {
                        timestamp: new Date().toISOString(),
                        extraction_count: extractionCount,
                        history_count: extractionHistory.length
                    },
                    extractions: extractionHistory
                };
                const json = JSON.stringify(historyData, null, 2);
                downloadData(json, `adsb_history_${timestamp}.json`, 'application/json');
                console.log('History data downloaded');
            },
            config: config
        };
        
        if (config.showNotifications) {
            showNotification("ADS-B Automated Extractor ready");
        }
    }

    // Fix for array.length
    function len(arr) {
        return arr ? arr.length : 0;
    }

    // Run the initialization
    initializeAutomatedExtractor();
})();
