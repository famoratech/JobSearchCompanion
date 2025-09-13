
"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Bot, Briefcase, Send, Plus, LogIn, UserPlus, BrainCircuit } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { auth, db, storage } from '../../firebase.config.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { format } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


// --- FEATURE COMPONENTS ---

const AIResumeOptimizer = ({ user }) => {
    const [resumeFile, setResumeFile] = useState(null);
    const [resumeName, setResumeName] = useState('');
    const [jobDescription, setJobDescription] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [optimizedResult, setOptimizedResult] = useState(null);

    const handleOptimize = async () => {
        if (!resumeFile || !jobDescription || !resumeName) {
            alert('Please name your resume, upload a file, and paste a job description.');
            return;
        }
        setIsLoading(true);

        try {
            const filePath = `resumes/${user.uid}/${Date.now()}_${resumeFile.name}`;
            const fileRef = ref(storage, filePath);
            await uploadBytes(fileRef, resumeFile);
            const downloadURL = await getDownloadURL(fileRef);

            const resumeRef = await addDoc(collection(db, "resumes"), {
                userId: user.uid,
                resumeName: resumeName,
                originalFilePath: filePath,
                originalFileUrl: downloadURL,
                createdAt: serverTimestamp(),
                status: 'Processing'
            });

            setTimeout(() => {
                const mockSuggestions = [
                    "Rephrased 'Managed project timelines' to 'Spearheaded project execution from conception to completion, delivering 15% ahead of schedule by implementing agile methodologies.'",
                    "Added keyword 'Cloud Deployment' based on job description analysis.",
                    "Quantified achievement: 'Increased user engagement' becomes 'Boosted user engagement by 25% over 3 months through A/B testing of UI components.'"
                ];
                setOptimizedResult({ suggestions: mockSuggestions, coverLetter: "..." });

                updateDoc(resumeRef, {
                    optimizedSuggestions: mockSuggestions,
                    generatedCoverLetter: "...",
                    status: 'Completed'
                });

                setIsLoading(false);
            }, 2000);

        } catch (error) {
            console.error("Error during optimization process:", error);
            alert("An error occurred during optimization.");
            setIsLoading(false);
        }
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex items-center"><FileText className="mr-2" /> AI Resume Optimizer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                 <Input 
                    placeholder="Name this resume (e.g., 'For Google SWE Role')"
                    value={resumeName}
                    onChange={(e) => setResumeName(e.target.value)}
                />
                <div className="grid w-full max-w-sm items-center gap-1.5">
                    <label htmlFor="resume-upload">Upload Your Resume (PDF/DOCX)</label>
                    <Input id="resume-upload" type="file" onChange={(e) => setResumeFile(e.target.files[0])} />
                </div>
                <div>
                    <label htmlFor="job-description">Paste Job Description</label>
                    <Textarea
                        id="job-description"
                        placeholder="Paste the full job description here..."
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                        rows={8}
                    />
                </div>
                <Button onClick={handleOptimize} disabled={isLoading}>
                    {isLoading ? 'Optimizing...' : 'Optimize My Application'}
                </Button>
                {optimizedResult && (
                    <div className="mt-6 p-4 bg-slate-50 rounded-lg space-y-4">
                        <h4 className="font-bold text-lg">Optimization Results:</h4>
                        <ul className="list-disc pl-5 text-sm space-y-1 mt-2">
                            {optimizedResult.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

const AIInterviewPrep = ({ user, activeApplication, onBack }) => {
    const [interview, setInterview] = useState(null);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [interviewId, setInterviewId] = useState(null);
    const chatContainerRef = useRef(null);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [interview?.turns]);

    const startNewInterview = useCallback(async () => {
        setIsLoading(true);
        try {
            const resumeRef = doc(db, 'resumes', activeApplication.resumeId);
            const resumeSnap = await getDoc(resumeRef);
            if (!resumeSnap.exists()) {
                throw new Error("Resume data could not be found.");
            }
            const resumeData = resumeSnap.data();

            const interviewDocRef = await addDoc(collection(db, 'interviews'), {
                userId: user.uid,
                applicationId: activeApplication.id,
                jobDescription: activeApplication.jobDescription,
                resumeText: `Resume Name: ${resumeData.resumeName}. File Path: ${resumeData.filePath || resumeData.originalFilePath}`,
                difficulty: 'intermediate',
                status: 'pending',
                createdAt: serverTimestamp(),
            });
            
            setInterviewId(interviewDocRef.id);
        } catch (error) {
            console.error("Error starting interview:", error);
            setInterview(prev => ({ ...prev, status: 'error', errorMessage: 'Could not start the interview. Please try again.' }));
            setIsLoading(false);
        }
    }, [activeApplication, user.uid]);

    useEffect(() => {
        if (activeApplication && !interviewId) {
            startNewInterview();
        }
    }, [activeApplication, interviewId, startNewInterview]);
    
    useEffect(() => {
        if (!interviewId) return;
        const unsubscribe = onSnapshot(doc(db, "interviews", interviewId), (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setInterview({ id: doc.id, ...data });
                if(data.status === 'active' || data.status === 'pending' || data.summary) {
                    setIsLoading(false);
                }
            } else {
                console.error("Interview document not found!");
                setIsLoading(false);
            }
        });
        return () => unsubscribe();
    }, [interviewId]);

    const handleSend = async () => {
        if (!input.trim() || !interviewId || interview?.status !== 'active') return;
        const userAnswer = input.trim();
        setInput('');
        setIsLoading(true);
        const currentTurnIndex = interview.turns.length - 1;
        const newTurns = [...interview.turns];
        newTurns[currentTurnIndex].userAnswer = userAnswer;
        try {
            await updateDoc(doc(db, "interviews", interviewId), { turns: newTurns });
        } catch (error) {
            console.error("Error submitting answer:", error);
            setIsLoading(false);
        }
    };
    
    const handleEndInterview = async () => {
        if (!interviewId) return;
        setIsLoading(true);
        try {
            await updateDoc(doc(db, "interviews", interviewId), { status: 'completed_request' });
        } catch (error) {
            console.error("Error ending interview:", error);
            setIsLoading(false);
        }
    }

    if (!activeApplication) {
        return (
            <Card className="w-full text-center p-8">
                <Briefcase className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-4 text-lg font-medium">Start an Interview from the Job Tracker</h3>
                <p className="mt-2 text-sm text-slate-500">Go to the &apos;Job Tracker&apos; tab and click the &apos;Prep for Interview&apos; button on any application to begin.</p>
            </Card>
        )
    }

    if (interview?.status === 'completed' && interview.summary) {
        return (
            <Card className="w-full">
                 <CardHeader><CardTitle>Interview Report for {activeApplication.role}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div><h4 className="font-bold">Overall Score: {interview.summary.overallScore}/100</h4></div>
                    <div><h5 className="font-semibold">Strengths:</h5><p className="text-sm">{interview.summary.strengths}</p></div>
                    <div><h5 className="font-semibold">Areas for Improvement:</h5><p className="text-sm">{interview.summary.areasForImprovement}</p></div>
                     <Button onClick={onBack}>Back to Tracker</Button>
                </CardContent>
            </Card>
        )
    }

    const isAwaitingFirstQuestion = interview?.status === 'pending' || !interview?.turns;
    const isInterviewActive = interview?.status === 'active';
    const lastTurn = isInterviewActive && interview.turns[interview.turns.length - 1];
    const isAiTurn = isInterviewActive && lastTurn && !lastTurn.userAnswer;
    
    return (
        <Card className="w-full h-[70vh] flex flex-col">
            <CardHeader>
                 <div className="flex justify-between items-center">
                     <CardTitle className="flex items-center"><Bot className="mr-2" /> Mock Interview: {activeApplication.role}</CardTitle>
                     <Button variant="outline" onClick={onBack}>Back to Tracker</Button>
                 </div>
            </CardHeader>
            <CardContent ref={chatContainerRef} className="flex-grow overflow-y-auto space-y-6 pr-4">
                {isAwaitingFirstQuestion && (
                     <div className="flex items-end gap-2 justify-start"><Bot className="w-6 h-6 self-start flex-shrink-0" /><div className="rounded-lg px-4 py-2 max-w-[80%] bg-slate-200 animate-pulse">Generating first question...</div></div>
                )}
                {interview?.turns?.map((turn, index) => (
                    <div key={index} className="space-y-4">
                        <div className={`flex items-end gap-2 justify-start`}><Bot className="w-6 h-6 self-start flex-shrink-0" /><div className={`rounded-lg px-4 py-2 max-w-[80%] bg-slate-200`}>{turn.question}</div></div>
                        {turn.userAnswer && (<div className={`flex items-end gap-2 justify-end`}><div className={`rounded-lg px-4 py-2 max-w-[80%] bg-slate-900 text-white`}>{turn.userAnswer}</div></div>)}
                        {turn.feedback && (<div className={`flex items-end gap-2 justify-start`}><Bot className="w-6 h-6 self-start flex-shrink-0" /><div className={`rounded-lg px-4 py-2 max-w-[80%] border border-blue-300 bg-blue-50 text-sm`}><p className="font-bold text-blue-800">Feedback:</p>{turn.feedback}</div></div>)}
                    </div>
                ))}
                 {isLoading && isAiTurn && <div className="flex justify-start"><div className="bg-slate-200 rounded-lg px-4 py-2 animate-pulse">...</div></div>}
                 {interview?.status === 'error' && <div className="text-red-500 p-2">{interview.errorMessage}</div>}
            </CardContent>
            <CardFooter className="flex-col items-start gap-4 border-t pt-6">
                <div className="flex w-full items-center space-x-2">
                    <Input type="text" placeholder={isAiTurn ? "Type your answer..." : "Waiting for the next question..."} value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSend()} disabled={!isAiTurn || isLoading} />
                    <Button onClick={handleSend} disabled={!isAiTurn || isLoading}><Send className="h-4 w-4"/></Button>
                </div>
                 <Button onClick={handleEndInterview} disabled={isLoading || !isInterviewActive} variant="destructive" size="sm">End Interview & Get Report</Button>
            </CardFooter>
        </Card>
    );
};


const JobApplicationTracker = ({ user, onStartInterview }) => {
    const [applications, setApplications] = useState([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedApp, setSelectedApp] = useState(null);

    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, "applications"), where("userId", "==", user.uid));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setApplications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [user]);

    const handleOpenDialog = (app = null) => {
        setSelectedApp(app);
        setIsDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setSelectedApp(null);
        setIsDialogOpen(false);
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle className="flex items-center"><Briefcase className="mr-2" /> Job Application Tracker</CardTitle>
                    <Button onClick={() => handleOpenDialog()}><Plus className="mr-2 h-4 w-4"/> Add Application</Button>
                </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {applications.map(app => (
                    <Card key={app.id} className="flex flex-col justify-between">
                        <CardHeader onClick={() => handleOpenDialog(app)} className="cursor-pointer"><CardTitle className="text-lg">{app.role}</CardTitle><p className="text-sm text-slate-500">{app.company}</p></CardHeader>
                        <CardContent><StatusBadge status={app.status} /></CardContent>
                        <CardFooter className="flex justify-between items-center"><Button onClick={() => onStartInterview(app)} className="bg-blue-600 hover:bg-blue-700 text-white"><BrainCircuit className="mr-2 h-4 w-4"/>Prep for Interview</Button></CardFooter>
                    </Card>
                ))}
                 {applications.length === 0 && <p className="col-span-full text-center text-slate-500 py-8">No applications found. Add one to get started!</p>}
            </CardContent>
            <ApplicationFormDialog isOpen={isDialogOpen} onClose={handleCloseDialog} user={user} application={selectedApp} />
        </Card>
    );
};

const StatusBadge = ({ status }) => {
    const statusStyles = { Applied: 'bg-blue-100 text-blue-800', Interviewing: 'bg-yellow-100 text-yellow-800', Offer: 'bg-green-100 text-green-800', Rejected: 'bg-red-100 text-red-800', Bookmarked: 'bg-purple-100 text-purple-800' };
    return <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${statusStyles[status] || 'bg-gray-100 text-gray-800'}`}>{status}</span>;
};

const ApplicationFormDialog = ({ isOpen, onClose, user, application }) => {
    const [formData, setFormData] = useState({});
    const [userResumes, setUserResumes] = useState([]);
    const [newResumeFile, setNewResumeFile] = useState(null);
    const [newResumeName, setNewResumeName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if(!user) return;
        const q = query(collection(db, "resumes"), where("userId", "==", user.uid));
        const unsubscribe = onSnapshot(q, (snapshot) => setUserResumes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        return unsubscribe;
    }, [user]);

    useEffect(() => {
        if (application) {
            setFormData({ ...application, applicationDate: application.applicationDate ? format(application.applicationDate.toDate(), 'yyyy-MM-dd') : '' });
        } else {
             setFormData({ company: '', role: '', status: 'Bookmarked', resumeId: '', jobDescription: '', applicationDate: format(new Date(), 'yyyy-MM-dd') });
        }
    }, [application, isOpen]);

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        let finalResumeId = formData.resumeId;

        try {
            if (newResumeFile && newResumeName) {
                 const filePath = `resumes/${user.uid}/${Date.now()}_${newResumeFile.name}`;
                 const fileRef = ref(storage, filePath);
                 await uploadBytes(fileRef, newResumeFile);
                 const downloadURL = await getDownloadURL(fileRef);
                 const newResumeRef = await addDoc(collection(db, "resumes"), { userId: user.uid, resumeName: newResumeName, filePath: filePath, downloadURL: downloadURL, createdAt: serverTimestamp() });
                finalResumeId = newResumeRef.id;
            }
            if (!finalResumeId) {
                alert("Please select or upload a resume.");
                setIsSaving(false);
                return;
            }
            const dataToSave = { ...formData, resumeId: finalResumeId, userId: user.uid, applicationDate: new Date(formData.applicationDate), lastUpdated: serverTimestamp() };
            if (application) {
                await updateDoc(doc(db, "applications", application.id), dataToSave);
            } else {
                await addDoc(collection(db, "applications"), dataToSave);
            }
            setIsSaving(false);
            onClose();
        } catch (error) {
            console.error("Error saving application:", error);
            alert("Failed to save application.");
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{application ? 'Edit' : 'Add'} Application</DialogTitle>
                    <DialogDescription>
                        Fill in the details of your job application here. You can also link an existing resume or upload a new one.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSave} className="space-y-4">
                    <Input name="company" placeholder="Company Name" value={formData.company || ''} onChange={(e) => setFormData({...formData, company: e.target.value})} required />
                    <Input name="role" placeholder="Job Role" value={formData.role || ''} onChange={(e) => setFormData({...formData, role: e.target.value})} required />
                    <Select value={formData.status} onValueChange={(val) => setFormData({ ...formData, status: val })}>
                        <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>{['Bookmarked', 'Applied', 'Interviewing', 'Offer', 'Rejected'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="date" name="applicationDate" value={formData.applicationDate} onChange={(e) => setFormData({...formData, applicationDate: e.target.value})} />
                    <Textarea name="jobDescription" placeholder="Paste Job Description here..." value={formData.jobDescription || ''} onChange={(e) => setFormData({...formData, jobDescription: e.target.value})} rows={6}/>
                    <div className="p-4 border rounded-md space-y-3">
                        <label className="text-sm font-medium">Link a Resume</label>
                        <Select value={formData.resumeId} onValueChange={(val) => setFormData({ ...formData, resumeId: val })}>
                            <SelectTrigger><SelectValue placeholder="Select a Resume" /></SelectTrigger>
                            <SelectContent>{userResumes.map(r => <SelectItem key={r.id} value={r.id}>{r.resumeName}</SelectItem>)}</SelectContent>
                        </Select>
                         <p className="text-center text-sm text-slate-500">OR</p>
                        <Input placeholder="Name new resume" value={newResumeName} onChange={(e) => setNewResumeName(e.target.value)} />
                        <Input type="file" onChange={(e) => setNewResumeFile(e.target.files[0])} />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                        <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

// --- MAIN APP COMPONENT ---

export default function JobSearchCompanion() {
    const { currentUser, loading } = useAuth();
    const [activeTab, setActiveTab] = useState('tracker');
    const [activeInterviewApp, setActiveInterviewApp] = useState(null);

    const handleStartInterview = (application) => {
        setActiveInterviewApp(application);
        setActiveTab('interviewer');
    }
    const handleBackToTracker = () => {
        setActiveInterviewApp(null);
        setActiveTab('tracker');
    }

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>
    }
    if (!currentUser) {
        return <AuthScreen />;
    }

    const renderContent = () => {
        switch (activeTab) {
            case 'optimizer': return <AIResumeOptimizer user={currentUser} />;
            case 'interviewer': return <AIInterviewPrep user={currentUser} activeApplication={activeInterviewApp} onBack={handleBackToTracker}/>;
            case 'tracker': return <JobApplicationTracker user={currentUser} onStartInterview={handleStartInterview} />;
            default: return <JobApplicationTracker user={currentUser} onStartInterview={handleStartInterview} />;
        }
    };
    
    return (
        <main className="flex min-h-screen flex-col items-center p-4 md:p-8 lg:p-12 bg-slate-100 font-sans">
            <div className="w-full max-w-6xl">
                <header className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-800">Job Search Companion</h1>
                    <div>
                        <span className="text-sm mr-4">Welcome, {currentUser.email}!</span>
                        <Button onClick={() => signOut(auth)}>Logout</Button>
                    </div>
                </header>
                <nav className="flex space-x-2 bg-slate-100/80 backdrop-blur-sm p-2 rounded-lg mb-6 border border-slate-200">
                    <TabButton id="tracker" label="Job Tracker" icon={<Briefcase />} activeTab={activeTab} setActiveTab={setActiveTab}/>
                    <TabButton id="optimizer" label="Resume Optimizer" icon={<FileText />} activeTab={activeTab} setActiveTab={setActiveTab}/>
                    <TabButton id="interviewer" label="Interview Prep" icon={<Bot />} activeTab={activeTab} setActiveTab={setActiveTab}/>
                </nav>
                <div className="w-full">
                    {renderContent()}
                </div>
            </div>
        </main>
    );
}

const AuthScreen = () => {
    const [isLoginView, setIsLoginView] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

     const handleAuthAction = async () => {
        try {
            if (isLoginView) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
        } catch (error) {
            alert(error.message);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md">
                <Card>
                    <CardHeader><CardTitle className="text-center">{isLoginView ? 'Login' : 'Sign Up'}</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                         <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                         <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
                         <Button className="w-full" onClick={handleAuthAction}>
                            {isLoginView ? <><LogIn className="mr-2 h-4 w-4"/>Login</> : <><UserPlus className="mr-2 h-4 w-4"/>Sign Up</>}
                        </Button>
                        <p className="text-center text-sm">
                            {isLoginView ? "Don't have an account?" : "Already have an account?"}
                            <button className="font-semibold text-slate-700 hover:underline ml-1" onClick={() => setIsLoginView(!isLoginView)}>
                                {isLoginView ? 'Sign Up' : 'Login'}
                            </button>
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

const TabButton = ({ id, label, icon, activeTab, setActiveTab }) => (
    <button
       onClick={() => setActiveTab(id)}
       className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors ${
           activeTab === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
       }`}
   >
       {icon}
       {label}
   </button>
);
