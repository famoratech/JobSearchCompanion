# AI-Powered Job Search Companion Blueprint

## 1. Overview

This document outlines the architecture and features of the AI-Powered Job Search Companion, a Next.js application built within Firebase Studio. The application aims to streamline the job application process by providing AI-driven tools for resume optimization and mock interviews.

## 2. Core Features & Design

### 2.1. Implemented Features

*   **User Authentication:** Standard email/password login and sign-up.
*   **Job Application Tracker:** A central dashboard for users to add, edit, and track their job applications. Applications are stored in Firestore and displayed in a card-based layout. Key data points include company, role, status, and associated resume.
*   **AI Resume Optimizer:** A (currently mocked) feature to analyze a user's resume against a job description and provide optimization suggestions.
*   **AI Mock Interview Prep:** An interactive chat interface for practicing interviews. The AI takes on the role of an interviewer, asking relevant questions based on the user's resume and the target job.

### 2.2. Visual Design

*   **Layout:** A clean, modern, single-page application interface.
*   **Components:** Utilizes custom-styled components inspired by `shadcn/ui` for a consistent and professional look (Buttons, Cards, Inputs, etc.).
*   **Navigation:** A tab-based system allows users to switch between the Job Tracker, Resume Optimizer, and Interview Prep modules.
*   **Iconography:** Uses the `lucide-react` library for clear and modern icons that enhance user understanding.

## 3. Technical Architecture

*   **Framework:** Next.js with React (using the App Router).
*   **Styling:** Tailwind CSS for utility-first styling.
*   **Firebase Services:**
    *   **Authentication:** Manages user identity.
    *   **Firestore:** The primary database for storing user data, including applications, resumes, and interview sessions.
    *   **Cloud Storage:** Stores user-uploaded resume files.
    *   **Cloud Functions:** Provides backend logic for interacting with the AI model.

## 4. Current Challenge & Refactoring Plan

**Challenge:** The deployment of the initial Cloud Functions (`https.onCall`) is blocked by a Google Cloud organization policy ("Domain restricted sharing"). This prevents the creation of publicly invokable functions.

**Solution:** Re-architect the backend to use Firestore-triggered functions. This approach is more robust, scalable, and completely bypasses the organizational policy issue as it operates entirely within the Firebase ecosystem.

### Refactoring Steps:

1.  **Backend (`functions/index.js`):**
    *   **`startInterview` -> `onInterviewCreate`:** This function will be removed. A new function will be created that triggers `onCreate` of a new document in the `interviews` collection. It will read the initial data, call the AI model for the first question, and update the document with the question and an 'active' status.
    *   **`submitInterviewAnswer` -> `onInterviewUpdate`:** This function will be removed. A new function will trigger `onUpdate` of an `interviews` document. It will detect when a user has added an answer to the conversation `turns` array. It will then call the AI model to get feedback and the next question, and update the document with this new information.
    *   **`endInterview` -> `onInterviewEndRequest`:** This function will be removed. The `onInterviewUpdate` function will also detect when the document's status is changed to `completed_request`. It will then gather the conversation history, call the AI to generate a final summary, and write that summary back to the document, marking the status as 'completed'.

2.  **Frontend (`app/page.tsx`):**
    *   **Remove `httpsCallable`:** All calls to `httpsCallable` will be removed from the `AIInterviewPrep` component.
    *   **Implement Real-time Listening:** The component will be refactored to use Firestore's `onSnapshot` listener.
    *   **Start Interview:** Instead of calling a function, the "Start Interview" action will `addDoc` to the `interviews` collection with a 'pending' status. The component will then listen for the Cloud Function to update this document with the first question.
    *   **Submit Answer:** The "Send" button will now simply `updateDoc`, adding the user's answer to the `turns` array within the interview document. The new question and feedback will appear automatically via the `onSnapshot` listener.
    *   **End Interview:** The "End Interview" button will `updateDoc`, changing the interview document's status to `completed_request`. The final report will appear automatically via the `onSnapshot` listener.

This new architecture decouples the frontend from the backend logic, improves scalability, and creates a more event-driven and reactive user experience, all while resolving the deployment blocker.
