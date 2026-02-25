Pod::Spec.new do |s|
  s.name           = 'AudioDecoder'
  s.version        = '1.0.0'
  s.summary        = 'Native audio decoder using AVFoundation'
  s.description    = 'Decodes audio files (MP3, WAV, AAC, etc.) to PCM using AVFoundation'
  s.author         = ''
  s.homepage       = 'https://github.com/example'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
end
