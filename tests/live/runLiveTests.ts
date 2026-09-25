import { providerManager } from '../../server/providerManager';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

export async function runLiveProviderTests() {
  console.log('====================================================');
  console.log('🌐 Starting Live Provider Test Suite (External LLM API)');
  console.log('====================================================\n');

  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.log('⚠️ No live API keys found in environment. Skipping live network tests.');
    return;
  }

  if (process.env.GEMINI_API_KEY) {
    console.log('Testing live Gemini Provider token count & generation...');
    const tokenRes = await providerManager.countRealTokens('gemini-3.7-flash', 'Hello live API test');
    console.log('Gemini live token count result:', tokenRes);
    assert(tokenRes.tokenCount > 0, 'Gemini countTokens works');
  }

  console.log('\n✅ Live Provider Tests Complete');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('runLiveTests')) {
  runLiveProviderTests().catch((e) => {
    console.error('Live tests failed:', e);
    process.exit(1);
  });
}
