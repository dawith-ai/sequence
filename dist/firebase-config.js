window.SequenceFirebaseConfig = {
  apiKey: 'AIzaSyDY4lXLRdC1CFCCsBmAPgsedqFN2ciAsII',
  authDomain: 'sequence-arena-dawith.firebaseapp.com',
  projectId: 'sequence-arena-dawith',
  storageBucket: 'sequence-arena-dawith.firebasestorage.app',
  messagingSenderId: '440309433012',
  appId: '1:440309433012:web:06bf66d9bf82a8217f4de1'
}

window.addEventListener('load', () => {
  if (!window.firebase || !window.SequenceFirebaseConfig?.projectId) return
  if (!firebase.apps.length) firebase.initializeApp(window.SequenceFirebaseConfig)
  window.SequenceDB = firebase.firestore()
  window.SequenceDB.settings({ ignoreUndefinedProperties: true })
  window.dispatchEvent(new CustomEvent('sequence-firebase-ready'))
})
