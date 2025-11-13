"""
Azure OpenAI Formatter
Uses Azure OpenAI GPT-4 for intelligent parsing and cleaning of voter ID text
"""

import os
import json
import requests
from typing import Dict, List, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class AzureOpenAIFormatter:
    """
    Intelligent text formatter using Azure OpenAI
    Cleans and structures voter ID data extracted from OCR
    """
    
    def __init__(self):
        """Initialize Azure OpenAI with environment variables"""
        self.api_key = os.getenv('AZURE_OPENAI_API_KEY')
        self.endpoint = os.getenv('AZURE_OPENAI_ENDPOINT')
        self.deployment_name = os.getenv('AZURE_OPENAI_DEPLOYMENT_NAME', 'gpt-4o')
        self.api_version = os.getenv('AZURE_OPENAI_API_VERSION', '2024-12-01-preview')
        
        if not self.api_key:
            
            self.enabled = False
            return
        
        if not self.endpoint:
       
            self.enabled = False
            return
        
        # Remove trailing slash
        self.endpoint = self.endpoint.rstrip('/')
        
        # Construct API URL
        self.api_url = f"{self.endpoint}/openai/deployments/{self.deployment_name}/chat/completions?api-version={self.api_version}"
        
        self.enabled = True
 
    
    def is_available(self) -> bool:
        """Check if Azure OpenAI is available and configured"""
        return self.enabled
    
    def format_voter_id(self, raw_text: str, context: Optional[Dict] = None) -> Dict:
        """
        Format and clean voter ID text using AI
        
        Args:
            raw_text: Raw OCR text
            context: Optional context information (page number, position, etc.)
        
        Returns:
            Dictionary with:
                - voterID: Cleaned voter ID
                - confidence: Formatting confidence (0-1)
                - metadata: Additional extracted information
                - success: Boolean indicating success
        """
        if not self.enabled:
            # Fallback to simple regex cleaning
            return self._fallback_format(raw_text)
        
        if not raw_text or not raw_text.strip():
            return {
                'success': True,
                'voterID': '',
                'confidence': 1.0,
                'metadata': {}
            }
        
        try:
            # Construct prompt
            prompt = self._construct_format_prompt(raw_text, context)
            
            # Prepare API request
            headers = {
                'Content-Type': 'application/json',
                'api-key': self.api_key
            }
            
            payload = {
                'messages': [
                    {
                        'role': 'system',
                        'content': 'You are an expert at extracting and cleaning voter ID numbers from OCR text. You understand various voter ID formats from India including EPIC numbers.'
                    },
                    {
                        'role': 'user',
                        'content': prompt
                    }
                ],
                'temperature': 0.1,  # Low temperature for consistent results
                'max_tokens': 200,
                'response_format': {'type': 'json_object'}
            }
            
            # Make API request
            response = requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                timeout=30
            )
            
            if response.status_code != 200:
              
                return self._fallback_format(raw_text)
            
            # Parse response
            result = response.json()
            content = result['choices'][0]['message']['content']
            parsed = json.loads(content)
            
            return {
                'success': True,
                'voterID': parsed.get('voterID', ''),
                'confidence': parsed.get('confidence', 0.5),
                'metadata': parsed.get('metadata', {})
            }
        
        except Exception as e:
          
            return self._fallback_format(raw_text)
    
    def _construct_format_prompt(self, raw_text: str, context: Optional[Dict]) -> str:
        """Construct formatting prompt for Azure OpenAI"""
        
        context_str = ""
        if context:
            context_str = f"\n\nContext: {json.dumps(context, indent=2)}"
        
        prompt = f"""Extract and clean the voter ID from this OCR text:

OCR Text:
```
{raw_text}
```{context_str}

**Task:**
1. Identify the voter ID / EPIC number (usually format: ABC1234567 - 3 letters + 7 digits, or similar)
2. Clean OCR errors (common: O→0, I→1, S→5, etc.)
3. Remove any non-voter-ID text (labels, addresses, names, etc.)
4. Extract any additional metadata if present

**Return ONLY valid JSON in this format:**

{{
    "voterID": "<cleaned-voter-id>",
    "confidence": <0.0-1.0>,
    "metadata": {{
        "format": "<detected-format>",
        "corrections": "<list-of-corrections-made>",
        "originalLength": <number>
    }}
}}

**Rules:**
- If no valid voter ID found, return empty string for voterID
- Confidence: 1.0 = certain, 0.5 = uncertain, 0.0 = not found
- Only return the JSON, no additional text
"""
        return prompt
    
    def _fallback_format(self, raw_text: str) -> Dict:
        """Fallback formatting using regex (when AI not available)"""
        import re
        
        if not raw_text:
            return {
                'success': True,
                'voterID': '',
                'confidence': 1.0,
                'metadata': {'method': 'fallback-empty'}
            }
        
        # Remove extra whitespace
        text = ' '.join(raw_text.split())
        
        # Try to extract voter ID pattern
        # Pattern 1: 3 letters + 7 digits
        pattern1 = r'\b[A-Z]{3}\d{7}\b'
        match1 = re.search(pattern1, text.upper())
        if match1:
            return {
                'success': True,
                'voterID': match1.group(0),
                'confidence': 0.8,
                'metadata': {'method': 'fallback-regex', 'pattern': 'ABC1234567'}
            }
        
        # Pattern 2: 2-4 letters + 6-8 digits
        pattern2 = r'\b[A-Z]{2,4}\d{6,8}\b'
        match2 = re.search(pattern2, text.upper())
        if match2:
            return {
                'success': True,
                'voterID': match2.group(0),
                'confidence': 0.6,
                'metadata': {'method': 'fallback-regex', 'pattern': 'flexible'}
            }
        
        # No pattern found, return cleaned text
        cleaned = text.strip()
        return {
            'success': True,
            'voterID': cleaned,
            'confidence': 0.3,
            'metadata': {'method': 'fallback-cleaned'}
        }
    
    def batch_format_voter_ids(self, texts: List[str]) -> List[Dict]:
        """
        Format multiple voter IDs in batch for efficiency
        
        Args:
            texts: List of raw OCR texts
        
        Returns:
            List of formatted results
        """
        results = []
        
        for text in texts:
            result = self.format_voter_id(text)
            results.append(result)
        
        return results


# Test function
if __name__ == '__main__':

    
    try:
        formatter = AzureOpenAIFormatter()
        
        if formatter.is_available():
       
            
            # Test with sample text
      
            sample_texts = [
                "Voter ID: NOW1234567",
                "EPIC No: ABC 1234567",  # With space
                "मतदार ओळखपत्र: XYZ9876543",  # With Marathi text
                "123ABC4567890"  # Noisy
            ]
            
            for text in sample_texts:
               
                result = formatter.format_voter_id(text)
               
        
        else:
            print("FAIL: Azure OpenAI not configured - using fallback regex")
            print("\nTo enable AI-powered formatting:")
            print("1. Add AZURE_OPENAI_API_KEY to .env file")
            print("2. Add AZURE_OPENAI_ENDPOINT to .env file")
            print("3. Add AZURE_OPENAI_DEPLOYMENT_NAME to .env file")
            print("4. Restart the Python service")
            print("\nExample .env:")
            print("  AZURE_OPENAI_API_KEY=your_key_here")
            print("  AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/")
            print("  AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o")
            
            # Still test fallback
            formatter_fallback = AzureOpenAIFormatter()
            print("\n\nTesting fallback regex formatter...")
            result = formatter_fallback._fallback_format("Voter ID: NOW1234567")
            print(f"  Result: {result}")
    
    except Exception as e:
        print(f"FAIL: Error: {str(e)}")


