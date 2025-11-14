import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/utils/api';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';

interface Props {
  onSuccess?: (needsPassword: boolean) => void;
  onError?: (error: string) => void;
  buttonText?: 'signin_with' | 'signup_with' | 'continue_with';
}

export default function GoogleLoginButton({ 
  onSuccess, 
  onError,
  buttonText = 'signin_with' 
}: Props) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      const msg = 'No credential received from Google';
      console.error('❌', msg);
      onError?.(msg);
      return;
    }

    setLoading(true);
    
    try {
      console.log('✅ Google credential received, exchanging for JWT...');
      
      const response = await apiFetch('/auth/google/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token: credentialResponse.credential 
        }),
      });

      console.log('✅ Backend authentication successful:', response);

      if (response.access_token && response.user) {
        // ✅ Save to localStorage FIRST
        localStorage.setItem('mms_token', response.access_token);
        localStorage.setItem('user', JSON.stringify(response.user));
        
        console.log('✅ Token saved:', response.access_token.substring(0, 20) + '...');
        
        // Then update context
        login(response.access_token, response.user);
        
        window.dispatchEvent(new CustomEvent("user-login", { detail: response.user }));
        
        const needsPassword = response.user.needs_password || false;
        
        onSuccess?.(needsPassword);
        
        if (!needsPassword) {
          setTimeout(() => navigate('/discover'), 100);
        }
      }
      
    } catch (error: any) {
      console.error('❌ Google login failed:', error);
      const errorMsg = error?.body?.detail || error?.message || 'Login failed. Please try again.';
      setLoading(false);
      onError?.(errorMsg);
    }
  };

  const handleError = () => {
    console.error('❌ Google login failed - credential error');
    const errorMsg = 'Google login failed. Please try again.';
    setLoading(false);
    onError?.(errorMsg);
  };

  if (loading) {
    return (
      <div className="w-full flex justify-center py-3">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center">
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={handleError}
        useOneTap={false}
        theme="outline"
        size="large"
        text={buttonText}
        width="350"
        logo_alignment="left"
      />
    </div>
  );
}