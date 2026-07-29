// ============================================================
// FIRESTORE RULES AUTOMATED TESTS
// TaskAlert — Testy reguł bezpieczeństwa Firestore
// ============================================================
// Uruchomienie: npm test (wymaga @firebase/rules-unit-testing)

const {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');

let testEnv;

beforeAll(async () => {
    const rulesPath = path.join(__dirname, '../firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    testEnv = await initializeTestEnvironment({
        projectId: 'taskalert-test-project',
        firestore: {
            rules: rules,
            host: '127.0.0.1',
            port: 8080
        }
    });
});

afterAll(async () => {
    if (testEnv) {
        await testEnv.cleanup();
    }
});

beforeEach(async () => {
    if (testEnv) {
        await testEnv.clearFirestore();
    }
});

describe('Firestore Security Rules', () => {

    // ── 1. Izolacja danych użytkownika (/users/{uid}/*) ─────
    test('Użytkownik MOŻE odczytać własne przypomnienia', async () => {
        const alice = testEnv.authenticatedContext('alice_uid', { email: 'alice@firma.pl' });
        const ref = alice.firestore().doc('users/alice_uid/reminders/rem1');
        await assertSucceeds(ref.get());
    });

    test('Użytkownik NIE MOŻE odczytać przypomnień innego użytkownika', async () => {
        const bob = testEnv.authenticatedContext('bob_uid', { email: 'bob@firma.pl' });
        const ref = bob.firestore().doc('users/alice_uid/reminders/rem1');
        await assertFails(ref.get());
    });

    test('Niezalogowany użytkownik NIE MOŻE czytać prywatnych danych', async () => {
        const anon = testEnv.unauthenticatedContext();
        const ref = anon.firestore().doc('users/alice_uid/reminders/rem1');
        await assertFails(ref.get());
    });

    // ── 2. Whitelist użytkowników (/allowedUsers/{email}) ────
    test('Zalogowany użytkownik MOŻE odczytać whitelistę allowedUsers', async () => {
        const alice = testEnv.authenticatedContext('alice_uid', { email: 'alice@firma.pl' });
        const ref = alice.firestore().doc('allowedUsers/alice@firma.pl');
        await assertSucceeds(ref.get());
    });

    test('Użytkownik bez roli admin NIE MOŻE edytować allowedUsers', async () => {
        // Pre-populuj zwykłego usera w allowedUsers
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().doc('allowedUsers/user@firma.pl').set({
                email: 'user@firma.pl',
                role: 'user'
            });
        });

        const userCtx = testEnv.authenticatedContext('user_uid', { email: 'user@firma.pl' });
        const ref = userCtx.firestore().doc('allowedUsers/newuser@firma.pl');
        await assertFails(ref.set({ email: 'newuser@firma.pl', role: 'user' }));
    });

    test('Administrator MOŻE dodawać użytkowników do allowedUsers', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().doc('allowedUsers/admin@firma.pl').set({
                email: 'admin@firma.pl',
                role: 'admin'
            });
        });

        const adminCtx = testEnv.authenticatedContext('admin_uid', { email: 'admin@firma.pl' });
        const ref = adminCtx.firestore().doc('allowedUsers/newuser@firma.pl');
        await assertSucceeds(ref.set({ email: 'newuser@firma.pl', role: 'user' }));
    });

    test('Nikt NIE MOŻE usunąć konta super-admina', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().doc('allowedUsers/admin@firma.pl').set({
                email: 'admin@firma.pl',
                role: 'admin'
            });
            await context.firestore().doc('allowedUsers/tomasz.drozda.eit@gmail.com').set({
                email: 'tomasz.drozda.eit@gmail.com',
                role: 'super-admin'
            });
        });

        const adminCtx = testEnv.authenticatedContext('admin_uid', { email: 'admin@firma.pl' });
        const superAdminRef = adminCtx.firestore().doc('allowedUsers/tomasz.drozda.eit@gmail.com');
        await assertFails(superAdminRef.delete());
    });

    // ── 3. Alerty współdzielone (/sharedAlerts/{id}) ────────
    test('Zalogowany użytkownik MOŻE utworzyć alert zespołowy', async () => {
        const alice = testEnv.authenticatedContext('alice_uid', { email: 'alice@firma.pl' });
        const ref = alice.firestore().collection('sharedAlerts').doc('alert1');
        await assertSucceeds(ref.set({
            title: 'Przegląd pojazdu',
            createdBy: 'alice_uid',
            participants: [{ uid: 'alice_uid', role: 'owner' }]
        }));
    });

    test('Niezalogowany użytkownik NIE MOŻE tworzyć alertów zespołowych', async () => {
        const anon = testEnv.unauthenticatedContext();
        const ref = anon.firestore().collection('sharedAlerts').doc('alert2');
        await assertFails(ref.set({ title: 'Test' }));
    });
});
