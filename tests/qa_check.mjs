// ============================================================
// TASKALERT QA AUTOMATED TEST SUITE
// Weryfikacja logiki CRUD, Auth, Shared Alerts i Firestore
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, Timestamp, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { firebaseConfig } from '../js/firebase-config.js';

console.log('Starting TaskAlert QA Test Suite...');
