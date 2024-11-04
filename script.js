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

        // Add stats container
        this.statsContainer = document.createElement('div');
        this.statsContainer.className = 'stats-panel';
        this.progressSection.insertBefore(this.statsContainer, this.progressBar.parentElement);

        this.stats = {
            totalLinks: 0,
            processed: 0,
            successful: 0,
            failed: 0
        };

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
            const file = this.dataFile.files[0];
            if (!file) {
                this.updateStatus('Please select a file first', 'error');
                return;
            }

            this.resetStats();
            this.progressSection.style.display = 'block';
            this.downloadSection.style.display = 'none';
            this.updateStatus('Reading file...', 'reading');

            const data = await this.readFile(file);
            const imageUrls = this.extractImageUrls(data);
            
            this.stats.totalLinks = imageUrls.length;
            this.updateStats();

            if (imageUrls.length === 0) {
                this.updateStatus('No image URLs found in file', 'error');
                return;
            }

            this.updateStatus(`Found ${imageUrls.length} image links`, 'success');
            await this.downloadImages(imageUrls);

        } catch (error) {
            this.updateStatus(error.message, 'error');
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
        this.stats.processed = 0;
        this.stats.successful = 0;
        this.stats.failed = 0;
        
        this.updateStatus(`Downloading ${urls.length} images...`, 'downloading');

        for (let i = 0; i < urls.length; i++) {
            try {
                const blob = await this.downloadImageWithFallback(urls[i], i + 1, urls.length);
                
                if (blob) {
                    const filename = `image_${i + 1}${this.getFileExtension(urls[i])}`;
                    zip.file(filename, blob);
                    this.stats.successful++;
                } else {
                    this.stats.failed++;
                }
                
                this.stats.processed++;
                const progress = (this.stats.processed / urls.length) * 100;
                this.updateProgress(progress);
                this.updateStats();
                this.updateStatus(
                    `Downloading... ${this.stats.processed}/${urls.length} (${this.stats.failed} failed)`, 
                    'downloading'
                );
            } catch (error) {
                this.stats.failed++;
                this.updateStats();
                console.error(`Failed to download image ${i + 1}:`, error);
            }
        }

        try {
            this.updateStatus('Creating ZIP file...', 'zipping');
            const zipBlob = await zip.generateAsync({ 
                type: 'blob',
                onUpdate: (metadata) => {
                    this.updateStatus(`Compressing: ${Math.round(metadata.percent)}%`, 'zipping');
                }
            });

            const downloadUrl = URL.createObjectURL(zipBlob);
            this.downloadLink.href = downloadUrl;
            this.downloadLink.download = 'images.zip';
            this.downloadSection.style.display = 'block';

            const finalMessage = this.stats.failed > 0 
                ? `Complete! ${this.stats.successful} images processed, ${this.stats.failed} failed`
                : `Success! All ${this.stats.successful} images processed`;
            
            this.updateStatus(finalMessage, this.stats.failed > 0 ? 'warning' : 'complete');
        } catch (error) {
            this.updateStatus('Error creating ZIP file: ' + error.message, 'error');
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

    updateStatus(message, type = 'info') {
        console.log(message);
        this.statusElement.textContent = message;
        this.statusElement.className = `status status-${type}`;
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
        this.stats = {
            totalLinks: 0,
            processed: 0,
            successful: 0,
            failed: 0
        };
        this.updateStats();
        this.updateProgress(0);
    }

    updateStats() {
        this.statsContainer.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-label">Total Links</div>
                    <div class="stat-value">${this.stats.totalLinks}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Processed</div>
                    <div class="stat-value">${this.stats.processed}/${this.stats.totalLinks}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Success Rate</div>
                    <div class="stat-value">${this.stats.totalLinks ? 
                        Math.round((this.stats.successful / this.stats.totalLinks) * 100) : 0}%</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Failed</div>
                    <div class="stat-value">${this.stats.failed}</div>
                </div>
            </div>
        `;
    }
}

// Initialize the application
new ImageDownloader(); 