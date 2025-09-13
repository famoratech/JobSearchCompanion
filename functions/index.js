
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();

const geminiApiKey = functions.config().llm.apikey;
const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// This new function generates a secure URL for the browser to upload a file.
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

        try {
            const { jobDescription, resumeText, difficulty } = interviewData;
            const prompt = `
                Analyze the following resume and job description for a ${difficulty} role.
                Your task is to act as a friendly and professional interviewer.
                Based on the analysis, generate a single, open-ended "ice-breaker" question to start the interview.
                
                --- Job Description ---
                ${jobDescription}
                
                --- Resume ---
                ${resumeText}
                
                --- First Question ---
            `;
            const result = await model.generateContent(prompt);
            const firstQuestion = result.response.text();
            return snap.ref.update({
                startTime: admin.firestore.FieldValue.serverTimestamp(),
                status: 'active',
                turns: [{
                    question: firstQuestion,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    feedback: null,
                    userAnswer: null
                }]
            });
        } catch (error) {
            console.error(`[${interviewId}] Error in onInterviewCreate:`, error);
            return snap.ref.update({ status: 'error', errorMessage: 'Failed to generate the first question.' });
        }
    });

exports.onInterviewUpdate = functions.firestore
    .document('interviews/{interviewId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const oldData = change.before.data();
        const { interviewId } = context.params;

        const latestTurn = newData.turns[newData.turns.length - 1];
        const oldLatestTurn = oldData.turns[oldData.turns.length - 1];

        if (latestTurn.userAnswer && !oldLatestTurn.userAnswer) {
             try {
                const { jobDescription, resumeText, turns } = newData;
                const conversationHistory = turns.map(t => `Interviewer: ${t.question}\nUser: ${t.userAnswer || ''}`).join('\n\n');
                const prompt = `
                    You are an expert interview coach. A candidate is in a mock interview.
                    Your tasks are to:
                    1.  Provide brief, constructive feedback on the user's *last* answer.
                    2.  Generate the *next* logical interview question.
                    
                    --- Job Description ---
                    ${jobDescription}
                    
                    --- Resume ---
                    ${resumeText}
                    
                    --- Conversation History ---
                    ${conversationHistory}
                    
                    --- Output Format ---
                    Provide your response as a JSON object with two keys: "feedback" and "nextQuestion".
                `;
                
                const result = await model.generateContent(prompt);
                const responseText = result.response.text().replace(/```json/g, '').replace(/```/g, '');
                const { feedback, nextQuestion } = JSON.parse(responseText);

                const updatedTurns = [...turns];
                updatedTurns[updatedTurns.length - 1].feedback = feedback;
                updatedTurns.push({
                    question: nextQuestion,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    feedback: null,
                    userAnswer: null
                });
                
                return change.after.ref.update({ turns: updatedTurns });

            } catch (error) {
                console.error(`[${interviewId}] Error generating next question:`, error);
                const updatedTurns = [...newData.turns];
                updatedTurns.push({
                    question: "Sorry, I encountered an error. Let's try that again. Could you please repeat your last answer?",
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    feedback: null,
                    userAnswer: null
                });
                return change.after.ref.update({ turns: updatedTurns });
            }
        }
        
        if (newData.status === 'completed_request' && oldData.status !== 'completed_request') {
             try {
                const { jobDescription, resumeText, turns } = newData;
                const conversationHistory = turns.filter(t => t.userAnswer).map(t => `Q: ${t.question}\nA: ${t.userAnswer}\nFeedback: ${t.feedback}`).join('\n\n');
                const prompt = `
                    You are an expert career coach. Analyze the full transcript of a mock interview.
                    Your task is to provide a final performance report.
                    
                    --- Job Description ---
                    ${jobDescription}
                    
                    --- Resume ---
                    ${resumeText}
                    
                    --- Full Interview Transcript ---
                    ${conversationHistory}
                    
                    --- Output Format ---
                    Provide your response as a JSON object with three keys: "overallScore", "strengths", and "areasForImprovement".
                `;

                const result = await model.generateContent(prompt);
                const responseText = result.response.text().replace(/```json/g, '').replace(/```/g, '');
                const summary = JSON.parse(responseText);
                
                return change.after.ref.update({
                    summary,
                    status: 'completed',
                    endTime: admin.firestore.FieldValue.serverTimestamp()
                });

            } catch (error) {
                console.error(`[${interviewId}] Error generating summary:`, error);
                return change.after.ref.update({ status: 'error', errorMessage: 'Failed to generate the final summary.' });
            }
        }

        return null;
    });
