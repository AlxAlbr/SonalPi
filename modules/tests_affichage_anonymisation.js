/**
 * Tests unitaires pour affichAnonGen()
 * À exécuter dans la console du navigateur
 */

// Test 1: Vérifier que les fonctions existent
function testFonctionsExistent() {
    console.group("Test 1: Vérifier l'existence des fonctions");
    
    const fonctions = [
        'affichAnonGen',
        'verifierPresencePseudoEnEnt',
        'hideAnonGen',
        'exporterTableCorpusCSV',
        'escapeRegex',
        'ouvrirEntretienAnonGen',
        'ajouterStylesAnonGen'
    ];
    
    let tousPresents = true;
    fonctions.forEach(f => {
        const existe = typeof window[f] === 'function';
        console.log(`  ${existe ? '✓' : '✗'} ${f}()`);
        if (!existe) tousPresents = false;
    });
    
    console.groupEnd();
    return tousPresents;
}

// Test 2: Tester escapeRegex
function testEscapeRegex() {
    console.group("Test 2: Fonction escapeRegex()");
    
    const tests = [
        { input: "Jean Dupont", expected: "Jean Dupont" },
        { input: "Person_1", expected: "Person_1" },
        { input: "test.com", expected: "test\\.com" },
        { input: "test[1]", expected: "test\\[1\\]" },
        { input: "a+b", expected: "a\\+b" }
    ];
    
    let tousOk = true;
    tests.forEach(test => {
        const result = escapeRegex(test.input);
        const ok = result === test.expected;
        console.log(`  ${ok ? '✓' : '✗'} escapeRegex("${test.input}") = "${result}"`);
        if (!ok) tousOk = false;
    });
    
    console.groupEnd();
    return tousOk;
}

// Test 3: Test d'intégration simple
async function testIntegration() {
    console.group("Test 3: Test d'intégration");
    
    try {
        // Vérifier que les APIs electron existent
        const hasGetAnon = typeof window.electronAPI.getAnon === 'function';
        const hasGetEnt = typeof window.electronAPI.getEnt === 'function';
        const hasGetHtml = typeof window.electronAPI.getHtml === 'function';
        
        console.log(`  ${hasGetAnon ? '✓' : '✗'} window.electronAPI.getAnon()`);
        console.log(`  ${hasGetEnt ? '✓' : '✗'} window.electronAPI.getEnt()`);
        console.log(`  ${hasGetHtml ? '✓' : '✗'} window.electronAPI.getHtml()`);
        
        if (hasGetEnt) {
            const tabEnt = await window.electronAPI.getEnt();
            console.log(`  ✓ Récupéré ${tabEnt ? tabEnt.length : 0} entretiens`);
        }
        
        if (hasGetAnon) {
            const tabAnon = await window.electronAPI.getAnon();
            console.log(`  ✓ Récupéré ${tabAnon ? tabAnon.length : 0} anonymisations`);
        }
        
    } catch (error) {
        console.error(`  ✗ Erreur: ${error.message}`);
    }
    
    console.groupEnd();
}

// Lancer tous les tests
async function runAllTests() {
    console.log("=== TESTS AFFICHANONGEN() ===\n");
    
    testFonctionsExistent();
    testEscapeRegex();
    await testIntegration();
    
    console.log("\n=== FIN DES TESTS ===");
    console.log("\nPour afficher la table d'anonymisation, exécutez:");
    console.log("  affichAnonGen()");
}

// Pour exécuter les tests:
// runAllTests();
