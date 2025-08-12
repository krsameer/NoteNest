// app.js (module)

// Firebase (from CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

// Firebase config (same as before)
const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: ""
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);
const provider = new GoogleAuthProvider();

// DOM elements
const authContent = document.getElementById('auth-content');
const appContent = document.getElementById('app-content');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const userInfo = document.getElementById('userInfo');
const status = document.getElementById('status');

// Media elements
const imageInput = document.getElementById('imageInput');
const imageUpload = document.getElementById('imageUpload');
const voiceUpload = document.getElementById('voiceUpload');
const mediaPreview = document.getElementById('mediaPreview');
const clearMediaBtn = document.getElementById('clearMedia');
const imageModal = document.getElementById('imageModal');

// Toolbar / inputs
const addNoteBtn = document.getElementById('addNoteBtn');
const clearAllBtn = document.getElementById('clearAll');
const searchInput = document.getElementById('searchInput');
const noteInput = document.getElementById('noteInput');
const fontSelector = document.getElementById('fontSelector');
const darkModeToggle = document.getElementById('darkModeToggle');

// Current user and media state
let currentUser = null;
let unsubscribeFromNotes = null;
let currentImage = null;
let currentVoice = null;
let mediaRecorder = null;
let isRecording = false;

// Voice recording setup
let audioChunks = [];
let stream = null;

// -------- Service Worker registration (moved here) --------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(() => console.log('Service Worker registered'))
    .catch(err => console.error('SW registration failed:', err));
}

// -------- Helpers --------
function updateStatus(type, message) {
  status.className = `status-bar status-${type}`;
  status.innerHTML = `<i class="fas fa-${type === 'online' ? 'wifi' : type === 'syncing' ? 'sync-alt fa-spin' : type === 'recording' ? 'microphone' : 'exclamation-triangle'} me-2"></i>${message}`;
}

function checkMediaPreview() {
  if (!currentImage && !currentVoice) {
    mediaPreview.style.display = 'none';
    clearMediaBtn.style.display = 'none';
  }
}

function showImageModal(src) {
  document.getElementById('modalImage').src = src;
  imageModal.style.display = 'flex';
}
imageModal.addEventListener('click', () => (imageModal.style.display = 'none'));
window.showImageModal = showImageModal; // for onclick in rendered notes

// -------- Image selection --------
imageUpload.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('Please select a valid image file');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    alert('Image size must be less than 10MB');
    return;
  }

  currentImage = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('imagePreview').src = ev.target.result;
    document.getElementById('imagePreviewContainer').style.display = 'block';
    mediaPreview.style.display = 'block';
    clearMediaBtn.style.display = 'block';
  };
  reader.onerror = (err) => {
    console.error('Error reading image file:', err);
    alert('Error reading image file');
  };
  reader.readAsDataURL(file);
});

// -------- Voice recording --------
async function startRecording() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!window.MediaRecorder) throw new Error('MediaRecorder is not supported in this browser');

    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunks.push(event.data); };

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      currentVoice = audioBlob;
      const audioUrl = URL.createObjectURL(audioBlob);

      document.getElementById('voicePreviewContainer').style.display = 'flex';
      const playBtn = document.getElementById('playVoice');
      const audio = new Audio(audioUrl);

      playBtn.onclick = () => {
        if (audio.paused) { audio.play(); playBtn.innerHTML = '<i class="fas fa-pause"></i>'; }
        else { audio.pause(); playBtn.innerHTML = '<i class="fas fa-play"></i>'; }
      };
      audio.onended = () => (playBtn.innerHTML = '<i class="fas fa-play"></i>');

      mediaPreview.style.display = 'block';
      clearMediaBtn.style.display = 'block';
      document.getElementById('voiceText').textContent = 'Record Voice';
      document.getElementById('voiceSubtext').textContent = 'Click to start recording';
      voiceUpload.classList.remove('active', 'recording-pulse');
      updateStatus('online', 'Voice recorded successfully!');
      setTimeout(() => updateStatus('online', 'Connected & Synced'), 2000);
    };

    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event.error);
      alert('Recording error: ' + event.error);
      stopRecording();
    };

    mediaRecorder.start(1000);
    isRecording = true;
    document.getElementById('voiceText').textContent = 'Recording...';
    document.getElementById('voiceSubtext').textContent = 'Click to stop';
    voiceUpload.classList.add('active', 'recording-pulse');
    updateStatus('recording', 'Recording voice note...');
  } catch (error) {
    console.error('Error accessing microphone:', error);
    let msg = 'Could not access microphone. ';
    if (error.name === 'NotAllowedError') msg += 'Please allow microphone access and try again.';
    else if (error.name === 'NotFoundError') msg += 'No microphone found.';
    else msg += error.message;
    alert(msg);
    updateStatus('offline', 'Microphone access failed');
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    try {
      mediaRecorder.stop();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      isRecording = false;
    } catch (e) { console.error('Error stopping recording:', e); }
  }
}

voiceUpload.addEventListener('click', () => (isRecording ? stopRecording() : startRecording()));

// Remove media
document.getElementById('removeImage').addEventListener('click', () => {
  currentImage = null;
  document.getElementById('imagePreviewContainer').style.display = 'none';
  imageInput.value = '';
  checkMediaPreview();
});
document.getElementById('removeVoice').addEventListener('click', () => {
  currentVoice = null;
  document.getElementById('voicePreviewContainer').style.display = 'none';
  checkMediaPreview();
});
clearMediaBtn.addEventListener('click', () => {
  currentImage = null;
  currentVoice = null;
  document.getElementById('imagePreviewContainer').style.display = 'none';
  document.getElementById('voicePreviewContainer').style.display = 'none';
  imageInput.value = '';
  checkMediaPreview();
});

// -------- Storage upload helper --------
async function uploadFile(file, path) {
  try {
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error('Upload error:', error);
    if (error.code === 'storage/unauthorized') throw new Error('Storage access denied. Check Firebase Storage rules.');
    if (error.code === 'storage/invalid-url') throw new Error('Invalid storage bucket URL.');
    if (error.code === 'storage/quota-exceeded') throw new Error('Storage quota exceeded.');
    throw new Error(`Upload failed: ${error.message}`);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });
}

// -------- Notes rendering --------
function updateNotesCount() {
  const count = window.notes ? window.notes.length : 0;
  document.getElementById('notesCount').textContent = count;
  const emptyState = document.getElementById('emptyState');
  const notesList = document.getElementById('notesList');
  if (count === 0) { emptyState.style.display = 'block'; notesList.style.display = 'none'; }
  else { emptyState.style.display = 'none'; notesList.style.display = 'grid'; }
}

function renderNotes(notes) {
  const notesList = document.getElementById('notesList');
  notesList.innerHTML = '';
  notes.forEach((note) => {
    const li = document.createElement('li');
    li.className = 'note-item' + (note.pinned ? ' pinned' : '');

    const types = [];
    if (note.text) types.push('text');
    if (note.imageUrl || note.imageData) types.push('image');
    if (note.voiceUrl || note.voiceData) types.push('voice');

    // Image
    let imageHtml = '';
    if (note.imageUrl) {
      imageHtml = `<img src="${note.imageUrl}" class="note-image" alt="Note image" onclick="showImageModal('${note.imageUrl}')">`;
    } else if (note.imageData) {
      imageHtml = `<img src="${note.imageData}" class="note-image" alt="Note image" onclick="showImageModal('${note.imageData}')">`;
    }

    // Voice
    let voiceHtml = '';
    const voiceSrc = note.voiceUrl || note.voiceData;
    if (voiceSrc) {
      voiceHtml = `
        <div class="note-voice">
          <i class="fas fa-volume-up"></i>
          <audio controls style="flex: 1;">
            <source src="${voiceSrc}" type="audio/webm">
            Your browser does not support audio playback.
          </audio>
        </div>`;
    }

    li.innerHTML = `
      <div class="note-header">
        <div class="note-pin">${note.pinned ? '<i class="fas fa-thumbtack"></i>' : ''}</div>
      </div>
      ${note.text ? `<div class="note-text">${note.text}</div>` : ''}
      <div class="note-media">${imageHtml}${voiceHtml}</div>
      <div class="note-meta">
        <div class="note-date">
          <i class="fas fa-calendar-alt"></i>
          ${new Date(note.createdAt?.seconds * 1000 || Date.now()).toLocaleString()}
        </div>
        <div class="note-type-indicators">
          ${types.map(t => `<span class="type-indicator type-${t}">${t}</span>`).join('')}
        </div>
      </div>
      <div class="note-actions">
        <button class="btn-action btn-pin"><i class="fas fa-thumbtack"></i> ${note.pinned ? 'Unpin' : 'Pin'}</button>
        <button class="btn-action btn-delete"><i class="fas fa-trash"></i> Delete</button>
      </div>
    `;

    li.querySelector('.btn-delete').onclick = () => deleteNote(note.id);
    li.querySelector('.btn-pin').onclick = () => togglePin(note.id, !note.pinned);

    notesList.appendChild(li);
  });
  updateNotesCount();
}

// -------- CRUD --------
async function deleteNote(id) {
  if (!currentUser) return;
  updateStatus('syncing', 'Deleting note...');
  const noteToDelete = window.notes.find(n => n.id === id);

  if (noteToDelete?.imageUrl) {
    try { await deleteObject(ref(storage, `users/${currentUser.uid}/images/${id}`)); } catch {}
  }
  if (noteToDelete?.voiceUrl) {
    try { await deleteObject(ref(storage, `users/${currentUser.uid}/voice/${id}`)); } catch {}
  }

  await deleteDoc(doc(db, `users/${currentUser.uid}/notes`, id));
  updateStatus('online', 'Connected & Synced');
}

async function togglePin(id, shouldPin) {
  if (!currentUser) return;
  updateStatus('syncing', 'Updating note...');
  const noteRef = doc(db, `users/${currentUser.uid}/notes`, id);
  await setDoc(noteRef, { pinned: shouldPin }, { merge: true });
  updateStatus('online', 'Connected & Synced');
}

async function addNote() {
  const text = noteInput.value.trim();
  if (!text && !currentImage && !currentVoice) {
    alert('Please add some content to your note');
    return;
  }
  if (!currentUser) {
    alert('Please sign in to save notes');
    return;
  }

  updateStatus('syncing', 'Saving note...');
  try {
    const noteRef = doc(collection(db, `users/${currentUser.uid}/notes`));
    const noteData = { id: noteRef.id, text: text || '', createdAt: serverTimestamp(), pinned: false };

    if (currentImage) {
      try {
        const ext = currentImage.name.split('.').pop();
        const imagePath = `users/${currentUser.uid}/images/${noteRef.id}.${ext}`;
        noteData.imageUrl = await uploadFile(currentImage, imagePath);
      } catch (e) {
        console.warn('Storage failed for image, using base64 fallback:', e);
        noteData.imageData = await fileToBase64(currentImage);
      }
    }

    if (currentVoice) {
      try {
        const voicePath = `users/${currentUser.uid}/voice/${noteRef.id}.webm`;
        noteData.voiceUrl = await uploadFile(currentVoice, voicePath);
      } catch (e) {
        console.warn('Storage failed for voice, using base64 fallback:', e);
        noteData.voiceData = await fileToBase64(currentVoice);
      }
    }

    await setDoc(noteRef, noteData);

    // reset inputs
    noteInput.value = '';
    currentImage = null;
    currentVoice = null;
    document.getElementById('imagePreviewContainer').style.display = 'none';
    document.getElementById('voicePreviewContainer').style.display = 'none';
    imageInput.value = '';
    checkMediaPreview();

    updateStatus('online', 'Note saved successfully!');
    setTimeout(() => updateStatus('online', 'Connected & Synced'), 2000);
  } catch (error) {
    console.error('Error saving note:', error);
    updateStatus('offline', 'Error saving note: ' + error.message);
    alert('Error saving note: ' + error.message);
  }
}

// -------- Realtime notes --------
function loadUserNotes(user) {
  const notesRef = collection(db, `users/${user.uid}/notes`);
  unsubscribeFromNotes = onSnapshot(notesRef, (snapshot) => {
    const notes = [];
    snapshot.forEach((d) => notes.push(d.data()));
    notes.sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned - a.pinned;
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });
    window.notes = notes;
    renderNotes(notes);
  });
}

// -------- Bulk clear --------
async function clearAllNotes() {
  if (!currentUser || !window.notes || window.notes.length === 0) return;
  if (!confirm('Are you sure you want to delete all notes? This action cannot be undone.')) return;

  updateStatus('syncing', 'Deleting all notes...');
  try {
    const tasks = window.notes.map(async (note) => {
      if (note.imageUrl) { try { await deleteObject(ref(storage, `users/${currentUser.uid}/images/${note.id}`)); } catch {} }
      if (note.voiceUrl) { try { await deleteObject(ref(storage, `users/${currentUser.uid}/voice/${note.id}`)); } catch {} }
      return deleteDoc(doc(db, `users/${currentUser.uid}/notes`, note.id));
    });
    await Promise.all(tasks);
    updateStatus('online', 'Connected & Synced');
  } catch (e) {
    console.error('Error clearing notes:', e);
    updateStatus('offline', 'Error clearing notes');
  }
}

// -------- Auth state --------
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    authContent.style.display = 'none';
    appContent.style.display = 'block';
    userInfo.innerHTML = `<img src="${user.photoURL}" alt="User" class="user-avatar"><span class="user-name">${user.displayName}</span>`;
    loadUserNotes(user);
    updateStatus('online', 'Connected & Synced');
  } else {
    currentUser = null;
    authContent.style.display = 'block';
    appContent.style.display = 'none';
    userInfo.innerHTML = '';
    if (unsubscribeFromNotes) unsubscribeFromNotes();
  }
});

// -------- UI bindings --------
googleSignInBtn.onclick = () => signInWithPopup(auth, provider);
signOutBtn.onclick = () => signOut(auth);
addNoteBtn.onclick = addNote;
clearAllBtn.onclick = clearAllNotes;

// Search
searchInput.addEventListener('input', function () {
  const q = this.value.toLowerCase();
  const filtered = window.notes ? window.notes.filter(n => (n.text || '').toLowerCase().includes(q)) : [];
  renderNotes(filtered);
});

// Font + theme
fontSelector.addEventListener('change', function () {
  document.body.style.fontFamily = this.value === 'default' ? '' : this.value;
});
darkModeToggle.addEventListener('click', function () {
  document.body.classList.toggle('dark-mode');
  const icon = this.querySelector('i');
  const text = this.querySelector('span');
  if (document.body.classList.contains('dark-mode')) { icon.className = 'fas fa-sun'; text.textContent = 'Light Mode'; }
  else { icon.className = 'fas fa-moon'; text.textContent = 'Dark Mode'; }
});

// Keyboard shortcut: Cmd/Ctrl + Enter to add note
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    addNote();
  }
});
