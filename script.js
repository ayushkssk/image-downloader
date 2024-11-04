class ImageDownloader {
    constructor() {
        // ... existing constructor code ...

        // List of public CORS proxies with different services
        this.corsProxies = [
            'https://api.allorigins.win/raw?url=',
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://cors.bridged.cc/',
            'https://cors-proxy.htmldriven.com/?url=',
            'https://crossorigin.me/',
            'https://yacdn.org/proxy/',
            'https://api.codetabs.com/v1/proxy/?quest='
        ];

        // Generate random color dot
        this.initializeRandomIndicator();

        // Add version control
        this.versionControl = {
            major: 1,
            minor: 2,
            patch: 3,
            build: this.generateBuildHash()
        };
        
        this.initializeVersionIndicator();

        this.initializeTimeIndicator();
    }

    generateBuildHash() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    initializeVersionIndicator() {
        const container = document.createElement('div');
        container.className = 'version-indicator';
        
        // Create version display
        const version = document.createElement('span');
        version.className = 'version';
        version.textContent = `v${this.versionControl.major}.${this.versionControl.minor}.${this.versionControl.patch}`;
        
        // Create build hash
        const build = document.createElement('span');
        build.className = 'build';
        build.textContent = `#${this.versionControl.build}`;
        
        // Create timestamp
        const timestamp = document.createElement('span');
        timestamp.className = 'update-time';
        timestamp.textContent = new Date().toLocaleString();
        
        // Create status dot
        const dot = document.createElement('span');
        dot.className = 'status-dot';
        dot.style.backgroundColor = this.getRandomColor();
        
        // Assemble indicator
        container.appendChild(version);
        container.appendChild(build);
        container.appendChild(timestamp);
        container.appendChild(dot);
        
        // Insert at the top of the card
        const card = document.querySelector('.card');
        card.insertBefore(container, card.firstChild);
    }

    getRandomColor() {
        const hue = Math.floor(Math.random() * 360);
        return `hsl(${hue}, 70%, 50%)`;
    }

    async downloadImageWithFallback(url, currentIndex, total) {
        // First try: Direct download with custom headers
        try {
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                headers: {
                    'Accept': 'image/*, */*',
                    'Origin': window.location.origin
                }
            });
            if (response.ok) {
                return await response.blob();
            }
        } catch (error) {
            console.log(`Direct download failed for image ${currentIndex}, trying proxies...`);
        }

        // Second try: Multiple proxies simultaneously
        const proxyPromises = this.corsProxies.map(proxy => this.tryProxyDownload(proxy, url, currentIndex));
        
        try {
            // Race between all proxy attempts
            const blob = await Promise.any(proxyPromises);
            if (blob) {
                console.log(`Successfully downloaded image ${currentIndex}/${total}`);
                return blob;
            }
        } catch (error) {
            console.error(`All proxies failed for image ${currentIndex}/${total}`);
        }

        // Third try: Data URL conversion (for same-origin images)
        try {
            return await this.tryDataUrlDownload(url);
        } catch (error) {
            console.error(`Data URL method failed for image ${currentIndex}/${total}`);
        }

        return null;
    }

    async tryProxyDownload(proxy, url, index) {
        try {
            const proxiedUrl = `${proxy}${encodeURIComponent(url)}`;
            console.log(`Trying proxy ${proxy} for image ${index}`);
            
            const response = await fetch(proxiedUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'image/*, */*'
                },
                timeout: 5000 // 5 second timeout
            });

            if (response.ok) {
                const blob = await response.blob();
                if (blob.type.startsWith('image/')) {
                    return blob;
                }
                throw new Error('Not an image');
            }
            throw new Error(`HTTP ${response.status}`);
        } catch (error) {
            console.log(`Proxy ${proxy} failed:`, error.message);
            throw error; // Rethrow to be caught by Promise.any
        }
    }

    async tryDataUrlDownload(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(resolve, 'image/jpeg', 0.95);
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    async downloadImages(urls) {
        const zip = new JSZip();
        this.stats.processed = 0;
        this.stats.successful = 0;
        this.stats.failed = 0;
        
        this.updateStatus(`Downloading ${urls.length} images...`, 'downloading');

        // Process images in smaller batches to avoid overwhelming the browser
        const batchSize = 5;
        for (let i = 0; i < urls.length; i += batchSize) {
            const batch = urls.slice(i, i + batchSize);
            const promises = batch.map((url, batchIndex) => 
                this.processImage(url, zip, i + batchIndex, urls.length)
            );
            
            await Promise.allSettled(promises);
            
            // Update progress after each batch
            this.updateProgress((i + batch.length) / urls.length * 100);
            this.updateStats();
        }

        // Create and download zip
        try {
            this.updateStatus('Creating ZIP file...', 'zipping');
            const zipBlob = await zip.generateAsync({ 
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });

            const downloadUrl = URL.createObjectURL(zipBlob);
            this.downloadLink.href = downloadUrl;
            this.downloadLink.download = `images_${new Date().getTime()}.zip`;
            this.downloadSection.style.display = 'block';

            const finalMessage = `Complete! ${this.stats.successful} downloaded, ${this.stats.failed} failed`;
            this.updateStatus(finalMessage, this.stats.failed > 0 ? 'warning' : 'complete');
        } catch (error) {
            this.updateStatus('Error creating ZIP: ' + error.message, 'error');
        }
    }

    async processImage(url, zip, index, total) {
        try {
            const blob = await this.downloadImageWithFallback(url, index + 1, total);
            if (blob) {
                const filename = `image_${index + 1}${this.getFileExtension(url)}`;
                zip.file(filename, blob);
                this.stats.successful++;
            } else {
                this.stats.failed++;
            }
        } catch (error) {
            console.error(`Error processing image ${index + 1}:`, error);
            this.stats.failed++;
        } finally {
            this.stats.processed++;
            this.updateStatus(
                `Processing: ${this.stats.processed}/${total} (${this.stats.successful} successful)`, 
                'downloading'
            );
        }
    }

    initializeRandomIndicator() {
        const dot = document.getElementById('randomDot');
        const timestamp = document.getElementById('buildTimestamp');
        
        // Generate random color
        const colors = [
            '#ef4444', '#f97316', '#f59e0b', '#84cc16', 
            '#10b981', '#06b6d4', '#6366f1', '#8b5cf6', 
            '#d946ef', '#ec4899'
        ];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        
        // Set dot color
        if (dot) {
            dot.style.backgroundColor = randomColor;
        }

        // Update timestamp
        if (timestamp) {
            const now = new Date();
            const formattedDate = now.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
            timestamp.textContent = `Updated: ${formattedDate}`;
        }

        // Add build number
        const buildNumber = Math.floor(Math.random() * 1000);
        const version = document.querySelector('.version');
        if (version) {
            version.textContent = `v1.2.3 (${buildNumber})`;
        }
    }

    initializeTimeIndicator() {
        // Create or get the version indicator container
        let container = document.querySelector('.version-indicator');
        if (!container) {
            container = document.createElement('div');
            container.className = 'version-indicator';
            const card = document.querySelector('.card');
            card.insertBefore(container, card.firstChild);
        }

        // Create the indicator content
        container.innerHTML = `
            <span class="version">v1.2.4</span>
            <span class="build-number">#${this.generateBuildNumber()}</span>
            <span class="time-display">
                <span id="currentTime"></span>
                <span id="currentDate"></span>
            </span>
            <span class="status-dot" style="background-color: ${this.getRandomColor()}"></span>
        `;

        // Start the time update
        this.updateTime();
        // Update time every second
        setInterval(() => this.updateTime(), 1000);
    }

    updateTime() {
        const now = new Date();
        
        // Format time
        const timeElement = document.getElementById('currentTime');
        if (timeElement) {
            timeElement.textContent = now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
        }

        // Format date
        const dateElement = document.getElementById('currentDate');
        if (dateElement) {
            dateElement.textContent = now.toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        }
    }

    generateBuildNumber() {
        // Generate a random build number based on timestamp
        return Math.floor(Date.now() / 1000).toString(36).toUpperCase();
    }

    getRandomColor() {
        // Generate a pleasant random color
        const hues = [
            '#3b82f6', // blue
            '#10b981', // green
            '#8b5cf6', // purple
            '#f59e0b', // yellow
            '#ef4444', // red
            '#06b6d4', // cyan
            '#ec4899'  // pink
        ];
        return hues[Math.floor(Math.random() * hues.length)];
    }
} 