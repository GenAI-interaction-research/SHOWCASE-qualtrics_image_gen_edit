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
                style: styleParams[0],
                size: '1024x1024'
            };
            
            if (styleParams.length > 1) {
                requestBody.substyle = styleParams[1];
            }
            
            fetch('https://qualtrics-recraft-api-129769591311.europe-west1.run.app/generate-image', {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://emlyonbs.eu.qualtrics.com',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestBody)
            })
            .then(function(response) {
                clearTimeout(timeoutId);
                if (!response.ok) throw new Error('Network response failed');
                return response.json();
            })
            .then(function(data) {
                if (data.success && data.image_url) {
                    Qualtrics.SurveyEngine.setEmbeddedData('InitialPrompt', prompt);
                    Qualtrics.SurveyEngine.setEmbeddedData('InitialImageURL', data.image_url);
                    Qualtrics.SurveyEngine.setEmbeddedData('Iter1ImageURL', data.image_url);
                    that.enableNextButton();
                    that.clickNextButton();
                } else {
                    throw new Error(data.error || 'Invalid response');
                }
            })
            .catch(function(error) {
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