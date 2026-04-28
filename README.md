# ElectAI - Indian Election Education & Surveillance Platform

## 📌 Problem Statement
India has the world's largest democracy, yet a significant portion of the electorate remains unaware of the intricate election processes, their legal voting rights, and the correct procedures to report electoral malpractices (such as proxy voting, booth capturing, and violence). Furthermore, monitoring thousands of remote polling booths for safety and compliance is a massive logistical challenge that often relies on delayed manual reporting. Citizens lack an accessible, interactive, and multilingual platform to get real-time, accurate election information and emergency assistance.

<img width="1080" height="1080" alt="image" src="https://github.com/user-attachments/assets/58917867-c443-4cee-b8aa-5f634871c982" />
<img width="472" height="590" alt="image" src="https://github.com/user-attachments/assets/5738db69-c16a-4f5c-8567-f2ad6f5210f3" />



## 💡 Proposed Solution
**ElectAI** is a comprehensive, AI-powered election education and monitoring platform designed to bridge the information gap and enhance electoral security. It serves two primary functions:
1. **Interactive Voter Education:** Providing citizens with an interactive AI Chatbot and a Voice Assistant that can answer questions about the election timeline, Model Code of Conduct, IPC sections, and EVM operations in a conversational manner.
2. **AI-Driven Booth Surveillance:** A real-time CCTV monitoring dashboard that uses computer vision to detect anomalies (crowding, weapons, violence) at polling stations, instantly mapping the incident via GPS and alerting authorities.

By combining an intuitive, mobile-first web interface with powerful AI APIs and real-time mapping, ElectAI empowers voters with knowledge and provides a scalable security solution for election monitoring.

## 🛠️ Detailed Tech Stack

### Frontend & UI
- **HTML5 & Vanilla JavaScript**: Core structure and logic for maximum performance without heavy framework overhead.
- **Modern CSS3 (Custom Properties)**: Comprehensive design system utilizing CSS variables for theme management, fluid typography, and responsive layouts.
- **Glassmorphism Design Language**: Implementation of `backdrop-filter: blur()`, neon gradient accents (`#8b5cf6` to `#ec4899`), and translucent panels for a premium, futuristic aesthetic.
- **Dynamic Animations**: Custom canvas-based animated mesh orbs (Fibonacci lattice calculations) and CSS keyframe animations for interactive state feedback.

### Artificial Intelligence & Machine Learning
- **Groq API (LLaMA 3.3 70B)**: Primary LLM engine for the Chatbot and Voice Agent, providing ultra-fast, context-aware responses regarding Indian election laws and live updates.
- **Google Gemini 2.0 Flash API**: Integrated as a reliable fallback LLM engine.
- **TensorFlow.js (COCO-SSD)**: In-browser object detection model used in the CCTV Surveillance module to detect persons, movement, and potential threats in real-time camera feeds.
- **face-api.js**: Tiny Face Detector neural network utilized for local biometric verification during the user login/signup flow.

### Voice & Interaction
- **Web Speech API (`SpeechRecognition`)**: Native browser API for handling microphone input, featuring noise-cancellation logic and interim result rendering.
- **Web Speech API (`SpeechSynthesis`)**: Text-to-speech engine configured with `en-IN` specific voices for natural, localized audio feedback.

### Mapping & Geolocation
- **Leaflet.js**: Open-source interactive mapping library used to display incident locations.
- **OpenStreetMap (OSM)**: Map tile provider serving as a fallback-free mapping solution.
- **HTML5 Geolocation API**: Captures real-time device coordinates to pin security alerts accurately on the map.

### Deployment & Infrastructure
- **Docker**: Containerization using an `nginx:alpine` base image configured to serve static assets and inject Cloud Run's dynamic `$PORT`.
- **Google Cloud Run**: Fully managed serverless execution environment, deploying the Docker container with HTTPS termination and auto-scaling.
- **Google Cloud IAM & Build**: Automated source-to-container build pipeline and secure service account management.

---

## 🚀 Live Demo
The application is deployed and accessible globally at:
**[https://electai-728760552786.us-central1.run.app](https://electai-728760552786.us-central1.run.app)**

## 📁 Core Project Structure
- `index.html` - Landing page with dynamic typewriter effects.
- `chatbot.html` - Groq-powered AI conversational interface.
- `voice-agent.html` - Interactive voice assistant with animated orb feedback.
- `surveillance.html` - TF.js driven CCTV anomaly detection and Leaflet mapping.
- `legal-rights.html` - Searchable database of IPC and RPA election laws.
- `js/config.js` - Centralized API key and model management.
- `css/global.css` - Global theme tokens and glassmorphism utilities.
- `Dockerfile` - NGINX configuration for Cloud Run deployment.
