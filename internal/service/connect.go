package service

// CheckConnection verifies the configured profile by listing instances and
// returns the visible instance count on success.
func CheckConnection(profile string) (int, error) {
	instances, err := ListInstances(profile)
	if err != nil {
		return 0, err
	}
	return len(instances), nil
}
