/**
 * Script: Print Firestore Submissions Collection
 * Usage: npx ts-node scripts/printSubmissions.ts [userId]
 * 
 * If userId provided, filter by that user; else show all submissions.
 */
/// <reference types="node" />

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  getDoc,
  doc,
  DocumentData,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load Firebase config
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function printSubmissions() {
  try {
    const userId = process.argv[2]; // Optional: filter by userId

    console.log('\n=== FIRESTORE SUBMISSIONS QUERY ===\n');
    console.log(`Firebase Project ID: ${firebaseConfig.projectId}`);
    console.log(`Firestore Database: ${firebaseConfig.firestoreDatabaseId}`);
    if (userId) console.log(`Filter by User ID: ${userId}`);
    console.log('\n-----------------------------------\n');

    // Build query
    let q;
    if (userId) {
      q = query(
        collection(db, 'submissions'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
    } else {
      q = query(
        collection(db, 'submissions'),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
    }

    // Execute query
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('❌ No submissions found.');
      process.exit(0);
    }

    console.log(`✅ Found ${snapshot.size} submission(s)\n`);

    // Print each document
    let idx = 0;
    snapshot.forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
      idx++;
      const data = docSnap.data();
      const docId = docSnap.id;

      console.log(`--- Document ${idx} (ID: ${docId}) ---`);
      console.log(JSON.stringify(data, null, 2));
      console.log('');
    });

    console.log('=== END QUERY ===\n');
  } catch (error) {
    console.error('❌ Error fetching submissions:', error);
    process.exit(1);
  }
}

printSubmissions();
