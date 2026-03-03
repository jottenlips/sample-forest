Pod::Spec.new do |s|
  s.name           = 'AudioEngine'
  s.version        = '1.0.0'
  s.summary        = 'Native audio engine for Sample Forest'
  s.description    = 'AVAudioEngine-based sequencer and audio processing module'
  s.homepage       = 'https://github.com/sample-forest'
  s.license        = 'MIT'
  s.author         = 'Sample Forest'
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.source_files   = '**/*.swift'
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
end
