import Foundation
import Darwin

/// Utilities for converting between Mach absolute time and seconds.
/// AVAudioPlayerNode.scheduleBuffer(at:) requires AVAudioTime built from host time.
enum HostTimeUtils {
    private static let timebaseInfo: mach_timebase_info_data_t = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return info
    }()

    /// Current host time in Mach absolute ticks.
    static var now: UInt64 {
        mach_absolute_time()
    }

    /// Convert seconds to Mach absolute time ticks.
    static func secondsToHostTime(_ seconds: Double) -> UInt64 {
        let nanos = seconds * 1_000_000_000
        return UInt64(nanos * Double(timebaseInfo.denom) / Double(timebaseInfo.numer))
    }

    /// Convert Mach absolute time ticks to seconds.
    static func hostTimeToSeconds(_ hostTime: UInt64) -> Double {
        let nanos = Double(hostTime) * Double(timebaseInfo.numer) / Double(timebaseInfo.denom)
        return nanos / 1_000_000_000
    }

    /// Host time at `seconds` from now.
    static func hostTimeAfter(_ seconds: Double) -> UInt64 {
        now + secondsToHostTime(seconds)
    }
}
