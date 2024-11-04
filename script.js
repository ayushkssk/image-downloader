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
            await this.downloadAndZipImages(imageUrls, file.name.replace(/\.[^/.]+$/, ''));
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

    async downloadAndZipImages(urls, zipName) {
        const zip = new JSZip();
        this.processedImages = 0;
        this.updateStats();

        try {
            this.updateStatus('Downloading images...', 'downloading');
            const downloads = urls.map(async (url, index) => {
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    const blob = await response.blob();
                    const filename = `image_${index + 1}${this.getFileExtension(url)}`;
                    zip.file(filename, blob);
                    
                    this.processedImages++;
                    this.updateProgress((this.processedImages / this.totalImages) * 100);
                    this.updateStats();
                } catch (error) {
                    console.error(`Error downloading ${url}:`, error);
                    return null;
                }
            });

            await Promise.all(downloads);
            this.updateStatus('Creating ZIP file...', 'zipping');

            const zipBlob = await zip.generateAsync({ 
                type: 'blob',
                onUpdate: (metadata) => {
                    this.updateStatus('Compressing: ' + metadata.percent.toFixed(1) + '%', 'zipping');
                }
            });

            const downloadUrl = URL.createObjectURL(zipBlob);
            this.downloadLink.href = downloadUrl;
            this.downloadLink.download = `${zipName}_images.zip`;
            this.downloadSection.style.display = 'block';
            
            const successfulDownloads = this.processedImages;
            const failedDownloads = this.totalImages - successfulDownloads;
            
            this.updateStatus(
                `Complete! ${successfulDownloads} images processed${failedDownloads > 0 ? `, ${failedDownloads} failed` : ''}`,
                'complete'
            );
        } catch (error) {
            throw new Error('Error creating ZIP file: ' + error.message);
        }
    }

    getFileExtension(url) {
        const match = url.match(/\.(jpg|jpeg|png|gif)($|\?)/i);
        return match ? `.${match[1].toLowerCase()}` : '.jpg';
    }

    updateStatus(message, state = '') {
        this.statusElement.textContent = message;
        this.statusElement.className = 'status ' + state;
    }

    updateProgress(percentage) {
        const roundedPercentage = Math.round(percentage);
        this.progressBar.value = roundedPercentage;
        this.progressPercentage.textContent = `${roundedPercentage}%`;
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