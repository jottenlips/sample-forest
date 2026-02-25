Pod::Spec.new do |s|
  s.name           = 'AudioEngine'
  s.version        = '1.0.0'
  s.summary        = 'Native AVAudioEngine sequencer for sample-accurate timing'
  s.description    = 'Replaces JS-bridge audio scheduling with native AVAudioEngine for tight timing'
  s.author         = ''
  s.homepage       = 'https://github.com/example'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
end
