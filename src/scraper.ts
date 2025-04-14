import axios, { AxiosProxyConfig } from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs'; // Import fs module
import * as path from 'path'; // Import path module

// Define an interface for the result structure
interface ResultData {
    registrationNumber: string | null;
    studentName: string | null;
    totalMarks: string | null;
}

async function scrapeResult(registrationNumber: string): Promise<ResultData | null> {
    const formUrl = 'https://karresults.nic.in/slpufirst25_1.asp'; // URL of the page with the form
    const resultsUrl = 'https://karresults.nic.in/slakres25_1.asp'; // URL to POST the data

    // --- Step 1: GET request to fetch the form page and extract the dynamic token --- 
    let dynamicToken: string | undefined;
    try {
        // console.log(`Fetching form page to get token from: ${formUrl} ${proxy ? 'via proxy ' + proxy.host : ''}`); // Optional logging
        const formResponse = await axios.get(formUrl, {
            headers: {
                 // Use minimal headers necessary for the GET request, mimicking a browser visit
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive',
            },
        });
        const formHtml = formResponse.data;
        const $form = cheerio.load(formHtml);
        
        dynamicToken = $form('input[name="frmpuc_tokens"]').val();

        if (!dynamicToken) {
            console.error('Error: Could not find or extract frmpuc_tokens from the form page.');
             // console.log(formHtml); // Uncomment to inspect form page HTML if token isn't found
            return null;
        }
        // console.log(`Successfully extracted dynamic token: ${dynamicToken}`);

    } catch (error: any) {
        console.error(`Error fetching form page or extracting token (Reg: ${registrationNumber}):`, error.message);
        return null;
    }

    // --- Step 2: POST request using the extracted token to fetch results --- 
    const headers = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'Content-Type': 'application/x-www-form-urlencoded',
        // 'Cookie': '...', // Axios might handle cookies automatically, or manual handling needed if sessions are strict
        'Origin': 'https://karresults.nic.in',
        'Referer': formUrl, // Referer should be the form page
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
    };

    const data = new URLSearchParams();
    data.append('frmpuc_tokens', dynamicToken); // Use the extracted dynamic token
    data.append('reg', registrationNumber);
    data.append('ddlsub', 'S');

    try {
        // console.log(`Scraping results for ${registrationNumber} using token ${dynamicToken} ${proxy ? 'via proxy ' + proxy.host : ''}...`);
        const response = await axios.post(resultsUrl, data, {
             headers, 
        }); 
        const html = response.data;
        const $ = cheerio.load(html);

        // --- Extracting Data --- 
        const extractedData: ResultData = {
            registrationNumber: null,
            studentName: null,
            totalMarks: null
        };

        // Extract Name
        extractedData.studentName = $('table#details td:contains("Name")').next('td').find('span[style="font-weight: bold"]').text().trim();
        // Extract Registration Number
        extractedData.registrationNumber = $('table#details td:contains("Reg. No.")').next('td').find('span[style="font-weight: bold"]').text().trim();
        // Extract Total Obtained Marks
        extractedData.totalMarks = $('table#result td:contains("TOTAL OBTAINED MARKS")').next('td').text().trim();

        // Basic validation: Check if at least one piece of data was found
        if (!extractedData.studentName && !extractedData.registrationNumber && !extractedData.totalMarks) {
             // Check for known error messages on the results page itself
            if ($('body').text().includes("Invalid Reg Number") || $('body').text().includes("Result Withheld")) { 
                 // console.warn(`Result not found or invalid/withheld registration number: ${registrationNumber}`); // Keep this potentially useful warning silent for now
             } else {
                 // Keep this warning as it indicates unexpected page structure or errors
                 console.warn(`Could not extract valid data for ${registrationNumber}. Page structure might have changed or other error.`); 
             }
             return null;
        }
         
        // console.log("Scraping successful!"); // Reduce noise
        return extractedData;

    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            console.error(`Error scraping results (Axios) for ${registrationNumber}:`, error.message);
            // Log details potentially useful for proxy errors
            // console.error('Status:', error.response?.status);
            // console.error('Proxy used:', proxy ? `${proxy.host}:${proxy.port}` : 'None');
        } else {
             console.error(`Error scraping results for ${registrationNumber}:`, error);
        }
        return null;
    }
}

// --- Main Execution --- 
(async () => {
    // const regNumber = '20259258470'; // Original single registration number
    // const result = await scrapeResult(regNumber);

    // !!! --- IMPORTANT: Replace with your actual list of proxies --- !!!
    const proxies: AxiosProxyConfig[] = [
        // Array is definitely empty now.
    ];
    // !!! ----------------------------------------------------------- !!!

    if (proxies.length === 0) {
        console.warn("Proxy list is empty. Running without proxies.");
    }

    const baseRegNumber = '2025925'; // Changed base back
    const startSuffix = 8601;   // Start from XXXX = 8601 (Updated)
    const endSuffix = 9000;     // End at XXXX = 9000 (Updated)
    const delayBetweenRequestsMs = 500; // Delay is now active

    // --- CSV Setup --- 
    const csvFilePath = path.join(__dirname, '../', 'results.csv'); // Use forward slash for parent directory
    const csvHeader = 'Registration Number,Student Name,Total Marks\n';
    try {
        console.log(`Initializing CSV file at: ${csvFilePath}`);
        fs.writeFileSync(csvFilePath, csvHeader, 'utf8');
    } catch (err) {
        console.error("Error writing CSV header:", err);
        return; // Exit if we can't write the header
    }

    console.log(`Starting bruteforce for registration numbers: ${baseRegNumber}XXXX (from ${startSuffix.toString().padStart(4, '0')} to ${endSuffix.toString().padStart(4, '0')})`); // Log reflects range (4 digits)
    console.warn("WARNING: This will send", endSuffix - startSuffix + 1, `requests with a ${delayBetweenRequestsMs}ms delay. Ensure you have permission.`);
    if (proxies.length > 0) {
        console.log(`Using ${proxies.length} proxies.`);
    }

    let foundCount = 0;
    let errorCount = 0;

    for (let i = startSuffix; i <= endSuffix; i++) {
        // Format the suffix to be 4 digits with leading zeros
        const suffix = i.toString().padStart(4, '0'); // Updated padding to 4 digits
        const currentRegNumber = `${baseRegNumber}${suffix}`;

        console.log(`--- Attempting registration number: ${currentRegNumber} (i=${i}) ---`);

        // Select proxy to use for this request (rotate through the list)
        let currentProxy: AxiosProxyConfig | undefined = undefined;
        if (proxies.length > 0) {
            currentProxy = proxies[i % proxies.length];
        }

        // console.log(`--- [${i - startSuffix + 1}/${endSuffix - startSuffix + 1}] Attempting Reg No: ${currentRegNumber} ---`);
        const result = await scrapeResult(currentRegNumber);

        if (result) {
            const regNum = result.registrationNumber || '';
            const name = result.studentName || '';
            const marks = result.totalMarks || '';

            // Ensure at least one piece of data was actually extracted before saving
            if (regNum || name || marks) {
                foundCount++;
                
                // Basic CSV escaping (quote if contains comma)
                const escapeCsv = (field: string) => field.includes(',') ? `"${field.replace(/"/g, '""')}"` : field;
                
                const csvRow = `${escapeCsv(regNum)},${escapeCsv(name)},${escapeCsv(marks)}\n`;
                
                try {
                    fs.appendFileSync(csvFilePath, csvRow, 'utf8');
                    console.log(`[${foundCount} Found | ${errorCount} Error] Saved: ${currentRegNumber} - ${name}`);
                } catch (err) {
                    console.error(`Error appending result for ${currentRegNumber} to CSV:`, err);
                    errorCount++; // Count append errors as errors
                }
            }
        } else {
            errorCount++;
        }

        // Wait for the specified delay before the next request
        if (i < endSuffix) { 
            await new Promise(resolve => setTimeout(resolve, delayBetweenRequestsMs));
        }
    }

    console.log(`Bruteforce finished. Found and saved ${foundCount} results to ${csvFilePath}. Encountered ${errorCount} errors/empty results.`);

    // Original single result handling commented out:
    /*
    if (result) {
        console.log("--- Extracted Data ---");
        console.log(`Registration Number: ${result.registrationNumber || 'Not Found'}`);
        console.log(`Student Name: ${result.studentName || 'Not Found'}`);
        console.log(`Total Marks: ${result.totalMarks || 'Not Found'}`);
    } else {
        console.log("Failed to retrieve or parse result data.");
    }
    */
})(); 