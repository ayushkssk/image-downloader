class ImageDownloader {
    constructor() {
        this.dataFile = document.getElementById('dataFile');
        this.processButton = document.getElementById('processButton');
        this.progressBar = document.getElementById('progressBar');
        this.statusElement = document.getElementById('status');
        this.progressSection = document.querySelector('.progress-section');
        this.downloadSection = document.getElementById('downloadSection');
        this.downloadLink = document.getElementById('downloadLink');
        this.fileName = document.getElementById('fileName');
        this.progressPercentage = document.querySelector('.progress-percentage');
        
        this.statsElement = document.createElement('div');
        this.statsElement.className = 'stats-container';
        this.statusElement.parentNode.insertBefore(this.statsElement, this.statusElement.nextSibling);
        
        this.totalImages = 0;
        this.processedImages = 0;
        this.isProcessing = false;

        // List of CORS proxies
        this.corsProxies = [
            'https://corsproxy.io/?',
            'https://api.allorigins.win/raw?url=',
            'https://proxy.cors.sh/',
            'https://cors-anywhere.herokuapp.com/'
        ];

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.dataFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.processButton.disabled = false;
                this.fileName.textContent = file.name;
                this.updateStatus('File selected. Click Process to begin.', 'ready');
                this.progressSection.style.display = 'block';
                this.downloadSection.style.display = 'none';
                this.resetStats();
                console.log('File selected:', file.name);
            } else {
                this.processButton.disabled = true;
                this.fileName.textContent = 'No file chosen';
                this.progressSection.style.display = 'none';
            }
        });

        this.processButton.addEventListener('click', async () => {
            if (this.isProcessing) return;
            
            this.isProcessing = true;
            this.processButton.classList.add('processing');
            this.processButton.innerHTML = '<i class="fas fa-spinner"></i> Processing...';
            this.processButton.disabled = true;
            
            await this.processFile();
            
            this.isProcessing = false;
            this.processButton.classList.remove('processing');
            this.processButton.innerHTML = '<i class="fas fa-cog"></i> Process File';
            this.processButton.disabled = false;
        });
    }

    async processFile() {
        try {
            this.resetStats();
            this.progressSection.style.display = 'block';
            this.downloadSection.style.display = 'none';
            this.updateStatus('Reading file...', 'reading');

            const file = this.dataFile.files[0];
            const fileExtension = file.name.split('.').pop().toLowerCase();
            let data;

            if (fileExtension === 'csv') {
                data = await this.readCSVFile(file);
            } else {
                data = await this.readExcelFile(file);
            }

            const imageUrls = this.extractImageUrls(data);
            this.totalImages = imageUrls.length;
            this.updateStats();
            
            if (this.totalImages === 0) {
                throw new Error('No image URLs found in the file');
            }

            this.updateStatus(`Found ${this.totalImages} image links`, 'found');
            await this.downloadImages(imageUrls);
            console.log('Processing started');
            console.log('Found URLs:', imageUrls);
        } catch (error) {
            console.error('Error processing file:', error);
            this.updateStatus('Error: ' + error.message, 'error');
        }
    }

    readExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                    resolve(jsonData);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    readCSVFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const rows = text.split('\n');
                    const headers = rows[0].split(',').map(header => 
                        header.trim().replace(/^["']|["']$/g, '')
                    );
                    
                    const jsonData = rows.slice(1)
                        .filter(row => row.trim()) // Skip empty rows
                        .map(row => {
                            const values = this.parseCSVRow(row);
                            const rowData = {};
                            headers.forEach((header, index) =>
                                rowData[header] = values[index];
                            });
                            return rowData;
                        });
                    
                    resolve(jsonData);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    extractImageUrls(data) {
        return data
            .map(row => row.student_photo)
            .filter(url => url && typeof url === 'string');
    }

    async downloadImages(urls) {
        const zip = new JSZip();
        let completed = 0;
        const total = urls.length;

        this.updateStatus(`Downloading ${total} images...`);

        for (let i = 0; i < urls.length; i++) {
            try {
                const url = urls[i];
                const blob = await this.downloadImageWithFallback(url, i + 1, total);
                
                if (blob) {
                    const filename = `image_${i + 1}${this.getFileExtension(url)}`;
                    zip.file(filename, blob);
                    completed++;
                    const progress = (completed / total) * 100;
                    this.updateProgress(progress);
                    this.updateStatus(`Downloaded ${completed}/${total} images...`);
                }
            } catch (error) {
                console.error(`Failed to download image ${i + 1}:`, error);
            }
        }

        try {
            this.updateStatus('Creating ZIP file...');
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const downloadUrl = URL.createObjectURL(zipBlob);
            
            this.downloadLink.href = downloadUrl;
            this.downloadLink.download = 'images.zip';
            this.downloadSection.style.display = 'block';
            
            const failedCount = total - completed;
            const statusMessage = failedCount > 0 
                ? `Download ready! Successfully downloaded ${completed}/${total} images (${failedCount} failed).`
                : `Download ready! All ${total} images downloaded successfully!`;
            
            this.updateStatus(statusMessage);
            this.processButton.disabled = false;
        } catch (error) {
            this.updateStatus('Error creating ZIP file: ' + error.message);
            console.error('ZIP creation error:', error);
        }
    }

    async downloadImageWithFallback(url, currentIndex, total) {
        // Try direct download first
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'image/*, */*' }
            });
            if (response.ok) {
                console.log(`Direct download successful for image ${currentIndex}/${total}`);
                return await response.blob();
            }
        } catch (error) {
            console.log(`Direct download failed for image ${currentIndex}, trying proxies...`);
        }

        // Try all proxies simultaneously
        const proxyPromises = this.corsProxies.map(async (proxy) => {
            try {
                const proxiedUrl = proxy + encodeURIComponent(url);
                console.log(`Trying proxy: ${proxy} for image ${currentIndex}/${total}`);
                
                const response = await fetch(proxiedUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'image/*, */*'
                    }
                });

                if (response.ok) {
                    console.log(`Proxy ${proxy} successful for image ${currentIndex}/${total}`);
                    return await response.blob();
                }
            } catch (error) {
                console.log(`Proxy ${proxy} failed for image ${currentIndex}/${total}`);
                return null;
            }
        });

        // Wait for first successful response or all failures
        try {
            const results = await Promise.race([
                // Race between successful proxy downloads
                ...proxyPromises,
                // Timeout after 30 seconds
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Download timeout')), 30000)
                )
            ]);

            return results;
        } catch (error) {
            console.error(`All proxies failed for image ${currentIndex}/${total}:`, error);
            this.updateStatus(`Warning: Failed to download image ${currentIndex}/${total}`);
            return null;
        }
    }

    getFileExtension(url) {
        try {
            const pathname = new URL(url).pathname;
            const match = pathname.match(/\.(jpg|jpeg|png|gif)($|\?)/i);
            return match ? `.${match[1].toLowerCase()}` : '.jpg';
        } catch {
            return '.jpg';
        }
    }

    updateStatus(message) {
        console.log(message);
        this.statusElement.textContent = message;
    }

    updateProgress(percentage) {
        this.progressBar.value = percentage;
        document.querySelector('.progress-percentage').textContent = 
            `${Math.round(percentage)}%`;
    }

    updateFileName() {
        const file = this.dataFile.files[0];
        this.fileName.textContent = file ? file.name : 'No file chosen';
    }

    resetStats() {
        this.totalImages = 0;
        this.processedImages = 0;
        this.updateStats();
        this.updateProgress(0);
    }

    updateStats() {
        this.statsElement.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-label">Total Images</div>
                    <div class="stat-value">${this.totalImages}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Processed</div>
                    <div class="stat-value">${this.processedImages}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Progress</div>
                    <div class="stat-value">${this.totalImages ? 
                        Math.round((this.processedImages / this.totalImages) * 100) : 0}%</div>
                </div>
            </div>
        `;
    }
}

// Initialize the application
new ImageDownloader(); 