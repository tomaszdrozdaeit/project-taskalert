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

    // ── 1. Izolacja danych i ochrona Whitelist (/users/{uid}/*) ──
    test('Użytkownik na whitelist MOŻE odczytać własne przypomnienia', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().doc('allowedUsers/alice@firma.pl').set({
                email: 'alice@firma.pl',
                role: 'user',
                isActive: true
            });
        });

        const alice = testEnv.authenticatedContext('alice_uid', { email: 'alice@firma.pl' });
        const ref = alice.firestore().doc('users/alice_uid/reminders/rem1');
        await assertSucceeds(ref.get());
    });

    test('Obcy użytkownik (spoza whitelist) NIE MOŻE odczytać ani zapisać przypomnień', async () => {
        const stranger = testEnv.authenticatedContext('stranger_uid', { email: 'obcy@hacker.pl' });
        const ref = stranger.firestore().doc('users/stranger_uid/reminders/rem1');
        await assertFails(ref.get());
        await assertFails(ref.set({ title: 'Atak' }));
    });

    test('Zablokowany użytkownik (isActive: false) NIE MOŻE odczytać przypomnień', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().doc('allowedUsers/blocked@firma.pl').set({
                email: 'blocked@firma.pl',
                role: 'user',
                isActive: false
            });
        });

        const blockedUser = testEnv.authenticatedContext('blocked_uid', { email: 'blocked@firma.pl' });
        const ref = blockedUser.firestore().doc('users/blocked_uid/reminders/rem1');
        await assertFails(ref.get());
    });

    test('Użytkownik NIE MOŻE odczytać przypomnień innego użytkownika', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().doc('allowedUsers/bob@firma.pl').set({
                email: 'bob@firma.pl',
                role: 'user',
                isActive: true
            });
        });

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

    test('Użytkownik bez roli admin NIE MOŻE dodawać użytkowników do allowedUsers', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().doc('allowedUsers/user@firma.pl').set({
                email: 'user@firma.pl',
                role: 'user',
                isActive: true
            });
        });

        const userCtx = testEnv.authenticatedContext('user_uid', { email: 'user@firma.pl' });
        const ref = userCtx.firestore().doc('allowedUsers/newuser@firma.pl');
        await assertFails(ref.set({ email: 'newuser@firma.pl', role: 'user', isActive: true }));
    });

    test('Administrator MOŻE dodawać użytkowników do allowedUsers', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().doc('allowedUsers/admin@firma.pl').set({
                email: 'admin@firma.pl',
                role: 'admin',
                isActive: true
            });
        });

        const adminCtx = testEnv.authenticatedContext('admin_uid', { email: 'admin@firma.pl' });
        const ref = adminCtx.firestore().doc('allowedUsers/newuser@firma.pl');
        await assertSucceeds(ref.set({ email: 'newuser@firma.pl', role: 'user', isActive: true }));
    });

    test('Nikt NIE MOŻE usunąć konta super-admina', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().doc('allowedUsers/admin@firma.pl').set({
                email: 'admin@firma.pl',
                role: 'admin',
                isActive: true
            });
            await context.firestore().doc('allowedUsers/tomasz.drozda.eit@gmail.com').set({
                email: 'tomasz.drozda.eit@gmail.com',
                role: 'super-admin',
                isActive: true
            });
        });

        const adminCtx = testEnv.authenticatedContext('admin_uid', { email: 'admin@firma.pl' });
        const superAdminRef = adminCtx.firestore().doc('allowedUsers/tomasz.drozda.eit@gmail.com');
        await assertFails(superAdminRef.delete());
    });

    // ── 3. Alerty współdzielone (/sharedAlerts/{id}) ────────
    test('Użytkownik na whitelist MOŻE utworzyć alert zespołowy', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().doc('allowedUsers/alice@firma.pl').set({
                email: 'alice@firma.pl',
                role: 'user',
                isActive: true
            });
        });

        const alice = testEnv.authenticatedContext('alice_uid', { email: 'alice@firma.pl' });
        const ref = alice.firestore().collection('sharedAlerts').doc('alert1');
        await assertSucceeds(ref.set({
            title: 'Przegląd pojazdu',
            createdBy: 'alice_uid',
            participants: [{ uid: 'alice_uid', role: 'owner' }]
        }));
    });

    test('Obcy użytkownik (spoza whitelist) NIE MOŻE tworzyć alertów zespołowych', async () => {
        const stranger = testEnv.authenticatedContext('stranger_uid', { email: 'obcy@hacker.pl' });
        const ref = stranger.firestore().collection('sharedAlerts').doc('alert1');
        await assertFails(ref.set({
            title: 'Atak alertów',
            createdBy: 'stranger_uid'
        }));
    });

    test('Niezalogowany użytkownik NIE MOŻE tworzyć alertów zespołowych', async () => {
        const anon = testEnv.unauthenticatedContext();
        const ref = anon.firestore().collection('sharedAlerts').doc('alert2');
        await assertFails(ref.set({ title: 'Test' }));
    });
});
