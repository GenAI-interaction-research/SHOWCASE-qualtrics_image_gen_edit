Qualtrics.SurveyEngine.addOnload(function() {
    var that = this;
    that.disableNextButton();
    
    function generateImage(prompt, styleConfig) {
        var loadingMessage = jQuery('#loadingMessage');
        var errorMessage = jQuery('#errorMessage');
        var generateButton = jQuery('#generateButton');
        var attempt = 0;
        var maxRetries = 5;
        
        function tryGenerate() {
            loadingMessage.find('p').text('Generating your image... Please wait.');
            loadingMessage.show();
            errorMessage.hide();
            generateButton.prop('disabled', true);
            
            var controller = new AbortController();
            var timeoutId = setTimeout(function() { controller.abort(); }, 60000);
            
            var styleParams = styleConfig.split(',');
            var requestBody = {
                prompt: prompt,
                model: 'recraftv3',
                style: styleParams[0] || 'realistic_image',
                n: 1,
                response_format: 'url'
            };
            
            console.log('Sending request with body:', requestBody);
            
            fetch('https://external.api.recraft.ai/v1/images/generations', {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer 6gu41BkgNuKrkox2lLjKIHV3sWWeoiAum6BK6jQKxMIJSTKvvDjUOPsK2xSKbu5k',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestBody)
            })
            .then(function(response) {
                clearTimeout(timeoutId);
                console.log('Response status:', response.status);
                console.log('Response headers:', response.headers);
                if (!response.ok) {
                    return response.text().then(text => {
                        console.log('Error response body:', text);
                        throw new Error('Network response failed: ' + text);
                    });
                }
                return response.json();
            })
            .then(function(data) {
                console.log('Response data:', data);
                if (data && data.data && data.data[0] && data.data[0].url) {
                    console.log('Generated Image URL:', data.data[0].url);
                    Qualtrics.SurveyEngine.setEmbeddedData('InitialPrompt', prompt);
                    Qualtrics.SurveyEngine.setEmbeddedData('InitialImageURL', data.data[0].url);
                    Qualtrics.SurveyEngine.setEmbeddedData('Iter1ImageURL', data.data[0].url);
                    that.enableNextButton();
                    that.clickNextButton();
                } else {
                    console.log('Invalid response structure:', data);
                    throw new Error('Invalid response structure from API');
                }
            })
            .catch(function(error) {
                console.error('Error details:', error);
                attempt++;
                if (attempt < maxRetries) {
                    console.log('Retrying... Attempt ' + attempt);
                    setTimeout(tryGenerate, 3000);
                } else {
                    errorMessage.html('Failed to generate image. Please try again. Error: ' + error.message).show();
                    loadingMessage.hide();
                    generateButton.prop('disabled', false);
                }
            });
        }
        
        tryGenerate();
    }
    
    jQuery('#imagePromptInput').on('input', function() {
        var count = this.value.length;
        jQuery('#characterCount').text(count + '/1000 characters');
    });
    
    jQuery('#generateButton').on('click', function() {
        var prompt = jQuery('#imagePromptInput').val().trim();
        var styleConfig = jQuery('#styleSelect').val();
        
        if (!prompt) {
            jQuery('#errorMessage').text('Please enter a prompt').show();
            return;
        }
        
        generateImage(prompt, styleConfig);
    });
});