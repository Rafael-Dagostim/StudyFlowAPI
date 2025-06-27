const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

async function testQuizGeneration() {
  try {
    console.log('🔐 Logging in...');
    
    // Login
    const loginResponse = await axios.post(`${API_BASE}/auth/signin`, {
      email: 'rafaeldagostim.pessoal@gmail.com',
      password: '123456Rr@'
    });
    
    const { accessToken } = loginResponse.data;
    console.log('✅ Login successful');
    
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
    
    // Get projects to find Historia project
    console.log('📂 Getting projects...');
    const projectsResponse = await axios.get(`${API_BASE}/projects`, { headers });
    const historiaProject = projectsResponse.data.find(p => p.name.includes('Historia'));
    
    if (!historiaProject) {
      console.log('❌ Historia project not found');
      console.log('Available projects:', projectsResponse.data.map(p => p.name));
      return;
    }
    
    console.log('✅ Found Historia project:', historiaProject.name);
    console.log('📄 Documents in project:', historiaProject.documents?.length || 0);
    
    // Create quiz file
    console.log('📝 Creating quiz...');
    const createResponse = await axios.post(`${API_BASE}/projects/${historiaProject.id}/generated-files`, {
      displayName: 'Quiz Test Historia Detailed',
      fileType: 'quiz',
      format: 'pdf',
      prompt: 'Crie um quiz com 10 perguntas sobre a história das Américas, incluindo descobrimento, colonização, independência, povos indígenas, e impacto cultural'
    }, { headers });
    
    console.log('📄 Create response:', createResponse.data);
    const fileId = createResponse.data.data.fileId;
    console.log('✅ Quiz creation started, file ID:', fileId);
    
    if (!fileId) {
      console.log('❌ File creation failed - no ID returned');
      return;
    }
    
    // Monitor generation status
    console.log('⏳ Monitoring generation...');
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      attempts++;
      
      try {
        const statusResponse = await axios.get(`${API_BASE}/projects/${historiaProject.id}/generated-files`, { headers });
        
        if (attempts === 1) {
          console.log('📊 Full status response:', JSON.stringify(statusResponse.data, null, 2));
        }
        
        let files = Array.isArray(statusResponse.data) ? statusResponse.data : statusResponse.data.data || statusResponse.data.files || [statusResponse.data];
        const file = Array.isArray(files) ? files.find(f => f.id === fileId) : (files.id === fileId ? files : null);
        
        if (file && file.versions && file.versions.length > 0) {
          const currentVersion = file.versions.find(v => v.version === file.currentVersion);
          console.log(`📊 Status: ${currentVersion.status} (attempt ${attempts}/${maxAttempts})`);
          
          if (currentVersion.status === 'completed') {
            console.log('✅ Generation completed!');
            console.log('📈 Generation time:', currentVersion.generationTime, 'seconds');
            console.log('📋 Context used:', currentVersion.contextUsed?.length || 0, 'chunks');
            
            if (currentVersion.contextUsed && currentVersion.contextUsed.length > 0) {
              console.log('📚 Sources used:');
              currentVersion.contextUsed.forEach((source, i) => {
                console.log(`  ${i + 1}. ${source.filename} (similarity: ${source.similarity})`);
              });
            } else {
              console.log('⚠️  No context chunks were used!');
            }
            
            return;
          } else if (currentVersion.status === 'failed') {
            console.log('❌ Generation failed');
            console.log('Error:', currentVersion.errorMessage);
            return;
          }
        }
      } catch (error) {
        console.log('⚠️  Error checking status:', error.message);
      }
    }
    
    console.log('⏰ Timeout waiting for generation to complete');
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testQuizGeneration();