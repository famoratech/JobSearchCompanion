const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();

const geminiApiKey = functions.config().llm.apikey;
const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Helper function for Gemini API with retry logic
async function generateContentWithRetry(prompt, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Gemini API attempt ${attempt}/${maxRetries}`);
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            lastError = error;
            console.error(`Gemini API attempt ${attempt} failed:`, error.message);
            
            // Wait before retrying (exponential backoff)
            if (attempt < maxRetries) {
                const delayMs = 1000 * Math.pow(2, attempt - 1);
                console.log(`Waiting ${delayMs}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    
    throw lastError;
}

// Helper function to safely parse JSON responses with better backtick handling
function safeJsonParse(jsonString) {
    try {
        // Remove all backticks and markdown code block indicators
        let cleanedString = jsonString
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();
        
        // Handle cases where the response might have leading/trailing text
        // Try to find the first { and last } to extract just the JSON part
        const firstBrace = cleanedString.indexOf('{');
        const lastBrace = cleanedString.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanedString = cleanedString.substring(firstBrace, lastBrace + 1);
        }
        
        console.log('Cleaned JSON string:', cleanedString);
        return JSON.parse(cleanedString);
    } catch (error) {
        console.error('JSON parse error:', error, 'Original string:', jsonString);
        
        // Try to extract key-value pairs manually as fallback
        try {
            const fallbackJson = {};
            
            // Extract overallScore
            const scoreMatch = jsonString.match(/"overallScore":\s*"([^"]+)"/);
            if (scoreMatch) fallbackJson.overallScore = scoreMatch[1];
            
            // Extract strengths array
            const strengthsMatch = jsonString.match(/"strengths":\s*\[([^\]]+)\]/);
            if (strengthsMatch) {
                fallbackJson.strengths = strengthsMatch[1]
                    .split(',')
                    .map(s => s.trim().replace(/"/g, ''))
                    .filter(s => s.length > 0);
            }
            
            // Extract areasForImprovement array
            const areasMatch = jsonString.match(/"areasForImprovement":\s*\[([^\]]+)\]/);
            if (areasMatch) {
                fallbackJson.areasForImprovement = areasMatch[1]
                    .split(',')
                    .map(s => s.trim().replace(/"/g, ''))
                    .filter(s => s.length > 0);
            }
            
            if (Object.keys(fallbackJson).length > 0) {
                console.log('Using fallback extracted JSON:', fallbackJson);
                return fallbackJson;
            }
        } catch (fallbackError) {
            console.error('Fallback extraction also failed:', fallbackError);
        }
        
        return null;
    }
}

// This function generates a secure URL for the browser to upload a file.
exports.getUploadUrl = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const { fileName, fileType } = data;
    const userId = context.auth.uid;
    const filePath = `resumes/${userId}/${Date.now()}_${fileName}`;

    const bucket = admin.storage().bucket();
    const file = bucket.file(filePath);
    const expires = Date.now() + 60 * 1000 * 5; // 5 minutes

    const [url] = await file.getSignedUrl({
        action: 'write',
        expires,
        contentType: fileType,
    });

    return { url, filePath };
});

exports.onInterviewCreate = functions.firestore
    .document('interviews/{interviewId}')
    .onCreate(async (snap, context) => {
        const interviewData = snap.data();
        const { interviewId } = context.params;

        console.log(`[${interviewId}] === INTERVIEW CREATE START ===`);

        // Check API key first
        if (!geminiApiKey || geminiApiKey === 'undefined' || geminiApiKey === 'YOUR_API_KEY_HERE') {
            console.error(`[${interviewId}] ❌ Gemini API key issue`);
            return snap.ref.update({ 
                status: 'error', 
                errorMessage: 'Configuration error. Please contact support.' 
            });
        }

        try {
            const { jobDescription, resumeText, difficulty } = interviewData;
            
            // Validate required fields
            if (!jobDescription || !resumeText) {
                console.error(`[${interviewId}] ❌ Missing fields`);
                return snap.ref.update({ 
                    status: 'error', 
                    errorMessage: 'Missing job description or resume text.' 
                });
            }

            console.log(`[${interviewId}] ✅ Fields validated, generating question...`);
            
            const prompt = `Generate a simple ice-breaker question for a ${difficulty} job interview.`;
            
            console.log(`[${interviewId}] Prompt:`, prompt);
            
            try {
                console.log(`[${interviewId}] 🚀 Attempting Gemini API call...`);
                const result = await model.generateContent(prompt);
                const firstQuestion = result.response.text();
                console.log(`[${interviewId}] ✅ Gemini success:`, firstQuestion);
                
                // Use regular Date object for array timestamps
                const currentTimestamp = new Date();
                
                return snap.ref.update({
                    startTime: admin.firestore.FieldValue.serverTimestamp(), // OK at root level
                    status: 'active',
                    turns: [{
                        question: firstQuestion,
                        timestamp: currentTimestamp, // Date object for arrays
                        feedback: null,
                        userAnswer: null
                    }]
                });
                
            } catch (apiError) {
                console.error(`[${interviewId}] ❌ Gemini API error:`, apiError.message);
                
                // Fallback to mock question with regular timestamp
                const currentTimestamp = new Date();
                const firstQuestion = "Tell me about yourself and why you're interested in this role?";
                
                return snap.ref.update({
                    startTime: admin.firestore.FieldValue.serverTimestamp(),
                    status: 'active',
                    turns: [{
                        question: firstQuestion,
                        timestamp: currentTimestamp, // Date object for arrays
                        feedback: null,
                        userAnswer: null
                    }]
                });
            }
            
        } catch (error) {
            console.error(`[${interviewId}] 💥 Unexpected error:`, error);
            
            return snap.ref.update({ 
                status: 'error', 
                errorMessage: 'Unexpected error. Please try again.' 
            });
        }
    });

exports.onInterviewUpdate = functions.firestore
    .document('interviews/{interviewId}')
    .onUpdate(async (change, context) => {
        console.log('=== onInterviewUpdate TRIGGERED ===');
        
        const newData = change.after.data();
        const oldData = change.before.data();
        const { interviewId } = context.params;

        console.log(`[${interviewId}] Interview update detected`);

        // STRICT VALIDATION
        if (!newData.turns || !Array.isArray(newData.turns)) {
            console.log(`[${interviewId}] SKIPPING - No valid turns array in new data`);
            return null;
        }

        if (!oldData.turns || !Array.isArray(oldData.turns)) {
            console.log(`[${interviewId}] SKIPPING - No valid turns array in old data`);
            return null;
        }

        if (newData.turns.length === 0) {
            console.log(`[${interviewId}] SKIPPING - Empty turns array in new data`);
            return null;
        }

        if (oldData.turns.length === 0) {
            console.log(`[${interviewId}] SKIPPING - Empty turns array in old data`);
            return null;
        }

        console.log('Proceeding with turn processing...');
        
        const latestTurn = newData.turns[newData.turns.length - 1];
        const oldLatestTurn = oldData.turns[oldData.turns.length - 1];

        if (latestTurn.userAnswer && !oldLatestTurn.userAnswer) {
            console.log('Processing new user answer...');
            try {
                const { jobDescription, resumeText, turns } = newData;
                const conversationHistory = turns.map(t => `Interviewer: ${t.question}\nUser: ${t.userAnswer || ''}`).join('\n\n');

                // CORRECT PROMPT FOR FEEDBACK + NEXT QUESTION
                const prompt = `
IMPORTANT: Respond with ONLY valid JSON, no additional text, no code blocks, no backticks.

Required JSON format:
{
  "feedback": "brief constructive feedback here",
  "nextQuestion": "next interview question here"
}

You are an expert interview coach. A candidate is in a mock interview.

Job: ${jobDescription.substring(0, 200)}
Resume: ${resumeText.substring(0, 200)}
Conversation: ${conversationHistory.substring(0, 500)}

Provide feedback on the last answer and ask the next question.

Response must be valid JSON only:`;
                
                const responseText = await generateContentWithRetry(prompt, 3);
                console.log('Gemini raw response:', responseText);
                
                const { feedback, nextQuestion } = safeJsonParse(responseText) || {};

                if (!feedback || !nextQuestion) {
                    throw new Error('Invalid response format from Gemini');
                }

                const updatedTurns = [...turns];
                updatedTurns[updatedTurns.length - 1].feedback = feedback;
                updatedTurns.push({
                    question: nextQuestion,
                    timestamp: new Date(), // Date object for arrays
                    feedback: null,
                    userAnswer: null
                });
                
                console.log('Updating turns with new question...');
                return change.after.ref.update({ turns: updatedTurns });

            } catch (error) {
                console.error(`[${interviewId}] Error generating next question:`, error);
                const updatedTurns = [...newData.turns];
                updatedTurns.push({
                    question: "Sorry, I encountered an error. Let's try that again. Could you please repeat your last answer?",
                    timestamp: new Date(), // Date object for arrays
                    feedback: null,
                    userAnswer: null
                });
                return change.after.ref.update({ turns: updatedTurns });
            }
        }
        
        if (newData.status === 'completed_request' && oldData.status !== 'completed_request') {
            console.log('Processing interview completion request...');
            try {
                const { jobDescription, resumeText, turns } = newData;
                
                if (!turns || turns.length === 0) {
                    console.error(`[${interviewId}] No turns to summarize`);
                    return change.after.ref.update({ 
                        status: 'error', 
                        errorMessage: 'No interview data to summarize.' 
                    });
                }
                
                const conversationHistory = turns.filter(t => t.userAnswer).map(t => `Q: ${t.question}\nA: ${t.userAnswer}\nFeedback: ${t.feedback}`).join('\n\n');
                
                console.log('Generating final summary with Gemini...');
                
                // CORRECT PROMPT FOR SUMMARY
                const prompt = `
IMPORTANT: Respond with ONLY valid JSON, no additional text, no code blocks, no backticks.

You are an expert career coach. Analyze the full transcript of a mock interview.
Your task is to provide a final performance report.

Required JSON format:
{
  "overallScore": "X/5",
  "strengths": ["strength1", "strength2"],
  "areasForImprovement": ["area1", "area2"]
}

--- Job Description ---
${jobDescription.substring(0, 300)}

--- Resume ---
${resumeText.substring(0, 300)}

--- Full Interview Transcript ---
${conversationHistory.substring(0, 1000)}

Response must be valid JSON only:`;

                const responseText = await generateContentWithRetry(prompt, 3);
                console.log('Gemini summary response:', responseText);
                
                const summary = safeJsonParse(responseText);
                
                if (!summary) {
                    throw new Error('Invalid summary format from Gemini');
                }

                console.log('Finalizing interview...');
                return change.after.ref.update({
                    summary,
                    status: 'completed',
                    endTime: admin.firestore.FieldValue.serverTimestamp() // OK at root level
                });

            } catch (error) {
                console.error(`[${interviewId}] Error generating summary:`, error);
                return change.after.ref.update({ status: 'error', errorMessage: 'Failed to generate the final summary.' });
            }
        }

        console.log('No relevant changes detected, skipping...');
        return null;
    });