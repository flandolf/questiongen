import { useEffect, useState } from 'react';

export function LoadingScreen() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const intervals = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 400),
      setTimeout(() => setPhase(3), 800),
    ];

    return () => intervals.forEach(clearTimeout);
  }, []);

  return (
    <div className='fixed inset-0 z-50 flex h-dvh w-screen items-center justify-center overflow-hidden bg-linear-to-br from-background via-background to-background/95 px-6 text-foreground'>
      {/* Animated background elements */}
      <div className='absolute inset-0 pointer-events-none'>
        <div className='absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse' />
        <div
          className='absolute bottom-1/3 right-1/4 w-72 h-72 bg-secondary/5 rounded-full blur-3xl animate-pulse'
          style={{ animationDelay: '1s' }}
        />
      </div>

      {/* Main content */}
      <div className='relative z-10 text-center space-y-6 max-w-md'>
        {/* Animated logo/icon */}
        <div className='inline-block mb-2'>
          <div
            className='w-16 h-16 mx-auto mb-4 relative'
            style={{
              animation: phase >= 1 ? 'fadeInScale 0.6s ease-out' : 'none',
            }}
          >
            {/* Animated circles */}
            <div className='absolute inset-0'>
              <div
                className='absolute inset-0 border-2 border-primary/30 rounded-lg'
                style={{
                  animation: 'rotate 4s linear infinite',
                  opacity: phase >= 1 ? 1 : 0,
                }}
              />
              <div
                className='absolute inset-1 border border-primary/50 rounded-lg'
                style={{
                  animation: 'rotateReverse 3s linear infinite',
                  opacity: phase >= 1 ? 0.7 : 0,
                }}
              />
            </div>

            {/* Center dot */}
            <div
              className='absolute top-1/2 left-1/2 w-2 h-2 bg-primary rounded-full -translate-x-1/2 -translate-y-1/2'
              style={{
                opacity: phase >= 1 ? 1 : 0,
                transition: 'opacity 0.4s ease-out',
              }}
            />
          </div>
        </div>

        {/* Heading */}
        <div
          style={{
            animation: phase >= 2 ? 'fadeInUp 0.5s ease-out' : 'none',
            opacity: phase >= 2 ? 1 : 0,
          }}
        >
          <h1 className='text-3xl font-semibold tracking-tight leading-tight'>
            Loading your workspace
          </h1>
        </div>

        {/* Description */}
        <div
          style={{
            animation: phase >= 2 ? 'fadeInUp 0.5s ease-out 0.1s' : 'none',
            opacity: phase >= 2 ? 1 : 0,
            animationFillMode: 'both',
          }}
        >
          <p className='text-sm text-muted-foreground leading-relaxed'>
            Restoring saved question sets, history, and analytics.
          </p>
        </div>

        {/* Loading indicator */}
        <div
          className='flex justify-center gap-1 pt-4'
          style={{
            animation: phase >= 3 ? 'fadeIn 0.4s ease-out 0.2s' : 'none',
            opacity: phase >= 3 ? 1 : 0,
            animationFillMode: 'both',
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className='w-1.5 h-1.5 bg-primary/60 rounded-full'
              style={{
                animation: 'pulse 1.4s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>

        {/* Subtle gradient line */}
        <div className='pt-6'>
          <div className='h-0.5 bg-linear-to-r from-transparent via-primary/30 to-transparent rounded-full' />
        </div>
      </div>

      <style>{`
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes rotate {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes rotateReverse {
          from {
            transform: rotate(360deg);
          }
          to {
            transform: rotate(0deg);
          }
        }
      `}</style>
    </div>
  );
}

export function RouteFallback() {
  return (
    <div className='min-h-full flex items-center justify-center p-8 bg-background'>
      <div className='text-center space-y-4'>
        <div
          className='h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto'
          style={{ animation: 'spin 1s linear infinite' }}
        />
        <p className='text-sm text-muted-foreground font-medium'>Loading...</p>
      </div>
    </div>
  );
}
