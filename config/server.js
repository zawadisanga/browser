const express = require('express');
const app = express();
const PORT = process.env.PORT || 16232;

// Serve static files
app.use(express.static('public'));

// API endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'running', 
        time: new Date().toISOString(),
        message: 'ZASS Browser is alive!'
    });
});

// Main page
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>ZASS Browser</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                }
                .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
                .card {
                    background: white;
                    border-radius: 20px;
                    padding: 40px;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
                }
                h1 { color: #667eea; margin-bottom: 10px; font-size: 48px; }
                p { color: #666; margin-bottom: 30px; font-size: 18px; }
                .search-box {
                    display: flex;
                    gap: 10px;
                    margin-top: 20px;
                }
                .search-box input {
                    flex: 1;
                    padding: 15px 20px;
                    border: 2px solid #e0e0e0;
                    border-radius: 50px;
                    font-size: 16px;
                    outline: none;
                }
                .search-box input:focus { border-color: #667eea; }
                .search-box button {
                    padding: 15px 30px;
                    background: #667eea;
                    color: white;
                    border: none;
                    border-radius: 50px;
                    cursor: pointer;
                    font-size: 16px;
                }
                .search-box button:hover { background: #5a67d8; }
                .result {
                    background: #f8f9fa;
                    padding: 15px;
                    margin: 10px 0;
                    border-radius: 10px;
                    text-align: left;
                    cursor: pointer;
                }
                .result:hover { background: #e9ecef; }
                .result-title { color: #1a73e8; font-weight: 600; margin-bottom: 5px; }
                .result-url { color: #666; font-size: 12px; word-break: break-all; }
                .loading {
                    display: none;
                    text-align: center;
                    padding: 20px;
                }
                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid #f3f3f3;
                    border-top: 3px solid #667eea;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                .status {
                    margin-top: 20px;
                    padding: 10px;
                    background: #e8f5e9;
                    border-radius: 10px;
                    color: #2e7d32;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <h1>🚀 ZASS Browser</h1>
                    <p>Unlimited Search - No Limits - No Censorship</p>
                    
                    <div class="search-box">
                        <input type="text" id="searchInput" placeholder="Search Google..." onkeypress="if(event.key==='Enter') search()">
                        <button onclick="search()">Search</button>
                    </div>
                    
                    <div id="loading" class="loading">
                        <div class="spinner"></div>
                        <p style="margin-top: 10px;">Searching...</p>
                    </div>
                    
                    <div id="results"></div>
                    
                    <div class="status">
                        ✅ ZASS Browser is running on Heroku!
                    </div>
                </div>
            </div>

            <script>
                async function search() {
                    const query = document.getElementById('searchInput').value.trim();
                    if (!query) return;
                    
                    // Check if it's a URL
                    if (query.includes('.') && (query.startsWith('http') || query.includes('www.'))) {
                        let url = query;
                        if (!url.startsWith('http')) url = 'https://' + url;
                        window.open(url, '_blank');
                        return;
                    }
                    
                    showLoading();
                    
                    try {
                        // Use Google search via proxy
                        const response = await fetch(\`https://www.google.com/search?q=\${encodeURIComponent(query)}\`);
                        const text = await response.text();
                        
                        // Simple parsing
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(text, 'text/html');
                        const results = [];
                        
                        doc.querySelectorAll('div.g').forEach(el => {
                            const titleEl = el.querySelector('h3');
                            const linkEl = el.querySelector('a');
                            if (titleEl && linkEl) {
                                results.push({
                                    title: titleEl.textContent,
                                    url: linkEl.href
                                });
                            }
                        });
                        
                        displayResults(results.slice(0, 10), query);
                    } catch (error) {
                        document.getElementById('results').innerHTML = \`<p style="color:red;">Error: \${error.message}</p>\`;
                    }
                    
                    hideLoading();
                }
                
                function displayResults(results, query) {
                    const container = document.getElementById('results');
                    if (results.length === 0) {
                        container.innerHTML = '<p>No results found. Try a different search.</p>';
                        return;
                    }
                    
                    container.innerHTML = \`<h3 style="margin-bottom:15px;">Results for "\${query}" (\${results.length})</h3>\`;
                    
                    results.forEach(result => {
                        const div = document.createElement('div');
                        div.className = 'result';
                        div.onclick = () => window.open(result.url, '_blank');
                        div.innerHTML = \`
                            <div class="result-title">\${result.title || result.url}</div>
                            <div class="result-url">\${result.url}</div>
                        \`;
                        container.appendChild(div);
                    });
                }
                
                function showLoading() {
                    document.getElementById('loading').style.display = 'block';
                    document.getElementById('results').innerHTML = '';
                }
                
                function hideLoading() {
                    document.getElementById('loading').style.display = 'none';
                }
            </script>
        </body>
        </html>
    `);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 ZASS Browser running on port', PORT);
});
